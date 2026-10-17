import { Request, Response } from 'express';
import prisma from '../services/prisma.js';
import storageService from '../services/storage.js';
import jkanimeScraper from '../services/scraper.js';
import streamExtractor from '../services/extractor.js';
import logger from '../utils/logger.js';

export class StreamController {
  public async streamLocal(req: Request, res: Response): Promise<void> {
    const episode_id = req.params['episodeId'] as string | undefined;
    if (!episode_id) {
      res.status(400).json({ error: 'episodeId es requerido' });
      return;
    }

    try {
      const episode = await prisma.episode.findUnique({
        where: { id: episode_id },
      });

      if (!episode || !episode.filePath) {
        res.status(404).json({ error: 'Episodio no encontrado o no ha sido descargado' });
        return;
      }

      const absolute_path = storageService.getAbsoluteEpisodePath(episode.filePath);
      const stat = storageService.getFileStat(absolute_path);

      if (!stat) {
        res.status(404).json({ error: 'Archivo de video no existe en el disco' });
        return;
      }

      const file_size = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0] || '0', 10);
        const end = parts[1] ? parseInt(parts[1], 10) : file_size - 1;

        if (start >= file_size || end >= file_size) {
          res.status(416).set({
            'Content-Range': `bytes */${file_size}`,
          }).end();
          return;
        }

        const chunk_size = end - start + 1;
        const file_stream = storageService.createStreamReader(absolute_path, { start, end });

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${file_size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunk_size,
          'Content-Type': 'video/mp4',
        });

        file_stream.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': file_size,
          'Content-Type': 'video/mp4',
          'Accept-Ranges': 'bytes',
        });

        storageService.createStreamReader(absolute_path).pipe(res);
      }
    } catch (error) {
      logger.error({ error, episode_id }, `Error en streamLocal`);
      res.status(500).json({ error: 'Error interno reproduciendo video local' });
    }
  }

  public async resolveRemote(req: Request, res: Response): Promise<void> {
    const episode_id = req.params['episodeId'] as string | undefined;
    if (!episode_id) {
      res.status(400).json({ error: 'episodeId es requerido' });
      return;
    }

    try {
      let anime_slug = '';
      let episode_num = 1;

      const episode = await prisma.episode.findUnique({
        where: { id: episode_id },
        include: {
          season: {
            include: { anime: true },
          },
        },
      });

      if (episode) {
        anime_slug = episode.season.anime.slug;
        episode_num = episode.number;
      } else {
        const last_dash = episode_id.lastIndexOf('-');
        if (last_dash > 0) {
          anime_slug = episode_id.substring(0, last_dash);
          episode_num = parseInt(episode_id.substring(last_dash + 1), 10);
        }
      }

      if (!anime_slug || isNaN(episode_num)) {
        res.status(404).json({ error: 'Episodio no encontrado' });
        return;
      }

      const servers = await jkanimeScraper.getEpisodeServers(anime_slug, episode_num);
      if (servers.length === 0) {
        res.status(404).json({ error: 'No se encontraron servidores para este episodio en JKAnime' });
        return;
      }

      const requested_server = req.query['server'] as string | undefined;
      if (requested_server) {
        const candidate = servers.find((s) => s.server.toLowerCase() === requested_server.toLowerCase());
        if (candidate) {
          logger.info({ requested_server, url: candidate.raw_url }, 'Intentando resolver servidor solicitado por el usuario');
          const stream = await streamExtractor.extractStreamFromCandidate(candidate);
          if (stream && (await streamExtractor.verifyStreamAvailability(stream))) {
            logger.info({ requested_server }, 'Servidor solicitado verificado exitosamente');
            res.json(stream);
            return;
          }

          logger.warn({ requested_server }, 'Servidor solicitado no disponible o archivo eliminado');
          res.status(404).json({
            error: `El servidor ${requested_server} no está disponible o el video fue eliminado.`,
            server_name: requested_server,
          });
          return;
        } else {
          res.status(404).json({
            error: `El servidor ${requested_server} no existe para este episodio.`,
            server_name: requested_server,
          });
          return;
        }
      }

      const optimal_stream = await streamExtractor.resolveOptimalStream(servers);

      if (!optimal_stream) {
        res.status(404).json({
          error: 'No se pudo resolver ningún servidor disponible (archivos posiblemente eliminados)',
          fallback_servers: servers,
        });
        return;
      }

      res.json(optimal_stream);
    } catch (error) {
      logger.error({ error, episode_id }, `Error resolviendo stream remoto`);
      res.status(500).json({ error: 'Error resolviendo stream remoto' });
    }
  }

  public async getServers(req: Request, res: Response): Promise<void> {
    const episode_id = req.params['episodeId'] as string | undefined;
    if (!episode_id) {
      res.status(400).json({ error: 'episodeId es requerido' });
      return;
    }

    try {
      let anime_slug = '';
      let episode_num = 1;

      const episode = await prisma.episode.findUnique({
        where: { id: episode_id },
        include: {
          season: {
            include: { anime: true },
          },
        },
      });

      if (episode) {
        anime_slug = episode.season.anime.slug;
        episode_num = episode.number;
      } else {
        const last_dash = episode_id.lastIndexOf('-');
        if (last_dash > 0) {
          anime_slug = episode_id.substring(0, last_dash);
          episode_num = parseInt(episode_id.substring(last_dash + 1), 10);
        }
      }

      if (!anime_slug || isNaN(episode_num)) {
        res.status(404).json({ error: 'Episodio no encontrado' });
        return;
      }

      const servers = await jkanimeScraper.getEpisodeServers(anime_slug, episode_num);

      const sorted = streamExtractor.sortServersByPriority(servers);
      res.json({ servers: sorted });
    } catch (error) {
      console.error(`Error listando servidores (${episode_id}):`, error);
      res.status(500).json({ error: 'Error obteniendo servidores del episodio' });
    }
  }
}

export const streamController = new StreamController();
export default streamController;
