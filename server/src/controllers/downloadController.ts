import { Request, Response } from 'express';
import prisma from '../services/prisma.js';
import downloadManager, { DownloadProgressEvent } from '../services/downloader.js';
import storageService from '../services/storage.js';
import { ensureAnimePersisted } from './animeController.js';

export class DownloadController {
  public async enqueueEpisode(req: Request, res: Response): Promise<void> {
    const raw_id = req.params['episodeId'] as string | undefined;
    if (!raw_id) {
      res.status(400).json({ error: 'episodeId es requerido' });
      return;
    }

    try {
      let target_episode_id = raw_id;

      // 1. Verificar si el episodio ya existe en la base de datos
      const existing_ep = await prisma.episode.findUnique({
        where: { id: raw_id },
      });

      if (!existing_ep) {
        // Puede tratarse de un ID sintético generado en navegación (ej: "rezero-kara-hajimeru-isekai-seikatsu-1")
        const match = raw_id.match(/^(.*)-(\d+)$/);
        if (!match) {
          res.status(404).json({ error: `Episodio ${raw_id} no encontrado en base de datos` });
          return;
        }

        const slug = match[1] || '';
        const ep_number = parseInt(match[2] || '0', 10);

        if (!slug || isNaN(ep_number)) {
          res.status(400).json({ error: 'Identificador de episodio inválido' });
          return;
        }

        // Persistir el anime con inWatchlist = false para soportar la descarga
        const persisted = await ensureAnimePersisted(slug, false);
        const resolved_ep = persisted.seasons
          .flatMap((s) => s.episodes)
          .find((e) => e.number === ep_number);

        if (!resolved_ep) {
          res.status(404).json({ error: `Episodio ${ep_number} de ${slug} no encontrado` });
          return;
        }

        target_episode_id = resolved_ep.id;
      }

      const task_id = await downloadManager.enqueueEpisode(target_episode_id);
      res.json({ message: 'Episodio encolado para descarga', task_id });
    } catch (error: any) {
      console.error(`Error encolando episodio ${raw_id}:`, error);
      res.status(500).json({ error: error.message || 'Error encolando episodio' });
    }
  }

  public async enqueueSeason(req: Request, res: Response): Promise<void> {
    const raw_season_id = req.params['seasonId'] as string | undefined;
    if (!raw_season_id) {
      res.status(400).json({ error: 'seasonId es requerido' });
      return;
    }

    try {
      let target_season_id = raw_season_id;
      const existing_season = await prisma.season.findUnique({
        where: { id: raw_season_id },
      });

      if (!existing_season) {
        const slug = raw_season_id.replace(/^transient-s1-/, '');
        const persisted = await ensureAnimePersisted(slug, false);
        const resolved_season = persisted.seasons[0];
        if (!resolved_season) {
          res.status(404).json({ error: `Temporada no encontrada para ${slug}` });
          return;
        }
        target_season_id = resolved_season.id;
      }

      const task_ids = await downloadManager.enqueueSeason(target_season_id);
      res.json({ message: `${task_ids.length} episodios encolados`, task_ids });
    } catch (error: any) {
      console.error(`Error encolando temporada ${raw_season_id}:`, error);
      res.status(500).json({ error: error.message || 'Error encolando temporada' });
    }
  }

  public async enqueueAnime(req: Request, res: Response): Promise<void> {
    const raw_anime_id = req.params['animeId'] as string | undefined;
    if (!raw_anime_id) {
      res.status(400).json({ error: 'animeId es requerido' });
      return;
    }

    try {
      let target_anime_id = raw_anime_id;
      const existing_anime = await prisma.anime.findUnique({
        where: { id: raw_anime_id },
      });

      if (!existing_anime) {
        const slug = raw_anime_id.replace(/^transient-/, '');
        const persisted = await ensureAnimePersisted(slug, false);
        target_anime_id = persisted.id;
      }

      const task_ids = await downloadManager.enqueueAnime(target_anime_id);
      res.json({ message: `${task_ids.length} episodios encolados para el anime`, task_ids });
    } catch (error: any) {
      console.error(`Error encolando anime ${raw_anime_id}:`, error);
      res.status(500).json({ error: error.message || 'Error encolando anime' });
    }
  }

  public async cancelTask(req: Request, res: Response): Promise<void> {
    const task_id = req.params['taskId'] as string | undefined;
    if (!task_id) {
      res.status(400).json({ error: 'taskId es requerido' });
      return;
    }

    try {
      await downloadManager.cancelDownload(task_id);
      res.json({ message: 'Descarga cancelada' });
    } catch (error: any) {
      console.error(`Error cancelando tarea ${task_id}:`, error);
      res.status(500).json({ error: error.message || 'Error cancelando descarga' });
    }
  }

  public async deleteFile(req: Request, res: Response): Promise<void> {
    const episode_id = req.params['episodeId'] as string | undefined;
    if (!episode_id) {
      res.status(400).json({ error: 'episodeId es requerido' });
      return;
    }

    try {
      const success = await storageService.deleteEpisodeFile(episode_id);
      if (success) {
        res.json({ message: 'Archivo eliminado y sincronizado en base de datos' });
      } else {
        res.status(404).json({ error: 'Episodio no tiene archivo asociado' });
      }
    } catch (error: any) {
      console.error(`Error eliminando archivo ${episode_id}:`, error);
      res.status(500).json({ error: error.message || 'Error eliminando archivo' });
    }
  }

  public async getTasks(_req: Request, res: Response): Promise<void> {
    try {
      const tasks = await prisma.downloadTask.findMany({
        take: 50,
        orderBy: { createdAt: 'desc' },
        include: {
          episode: {
            include: {
              season: {
                include: { anime: true },
              },
            },
          },
        },
      });

      const serialized = tasks.map((t) => ({
        ...t,
        episode: {
          ...t.episode,
          fileSizeBytes: t.episode.fileSizeBytes ? t.episode.fileSizeBytes.toString() : null,
        },
      }));

      res.json({ tasks: serialized });
    } catch (error) {
      console.error('Error obteniendo tareas:', error);
      res.status(500).json({ error: 'Error obteniendo tareas de descarga' });
    }
  }

  public async getDownloadedEpisodes(_req: Request, res: Response): Promise<void> {
    try {
      const episodes = await prisma.episode.findMany({
        where: { downloadStatus: 'COMPLETED' },
        orderBy: { updatedAt: 'desc' },
        include: {
          season: {
            include: { anime: true },
          },
        },
      });

      const serialized = episodes.map((ep) => ({
        ...ep,
        fileSizeBytes: ep.fileSizeBytes ? ep.fileSizeBytes.toString() : null,
      }));

      res.json({ episodes: serialized });
    } catch (error) {
      console.error('Error obteniendo episodios descargados:', error);
      res.status(500).json({ error: 'Error obteniendo episodios descargados' });
    }
  }

  public async getStorageUsage(_req: Request, res: Response): Promise<void> {
    try {
      const usage = await storageService.getStorageUsage();
      res.json(usage);
    } catch (error) {
      console.error('Error obteniendo uso de almacenamiento:', error);
      res.status(500).json({ error: 'Error calculando almacenamiento' });
    }
  }

  public streamProgress(req: Request, res: Response): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    res.write('event: connected\ndata: {"status":"connected"}\n\n');

    const progress_listener = (event: DownloadProgressEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    downloadManager.on('progress', progress_listener);

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      downloadManager.removeListener('progress', progress_listener);
    });
  }
}

export const downloadController = new DownloadController();
export default downloadController;
