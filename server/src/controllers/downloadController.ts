import { Request, Response } from 'express';
import prisma from '../services/prisma.js';
import downloadManager, { DownloadProgressEvent } from '../services/downloader.js';
import storageService from '../services/storage.js';

export class DownloadController {
  public async enqueueEpisode(req: Request, res: Response): Promise<void> {
    const episode_id = req.params['episodeId'] as string | undefined;
    if (!episode_id) {
      res.status(400).json({ error: 'episodeId es requerido' });
      return;
    }

    try {
      const task_id = await downloadManager.enqueueEpisode(episode_id);
      res.json({ message: 'Episodio encolado para descarga', task_id });
    } catch (error: any) {
      console.error(`Error encolando episodio ${episode_id}:`, error);
      res.status(500).json({ error: error.message || 'Error encolando episodio' });
    }
  }

  public async enqueueSeason(req: Request, res: Response): Promise<void> {
    const season_id = req.params['seasonId'] as string | undefined;
    if (!season_id) {
      res.status(400).json({ error: 'seasonId es requerido' });
      return;
    }

    try {
      const task_ids = await downloadManager.enqueueSeason(season_id);
      res.json({ message: `${task_ids.length} episodios encolados`, task_ids });
    } catch (error: any) {
      console.error(`Error encolando temporada ${season_id}:`, error);
      res.status(500).json({ error: error.message || 'Error encolando temporada' });
    }
  }

  public async enqueueAnime(req: Request, res: Response): Promise<void> {
    const anime_id = req.params['animeId'] as string | undefined;
    if (!anime_id) {
      res.status(400).json({ error: 'animeId es requerido' });
      return;
    }

    try {
      const task_ids = await downloadManager.enqueueAnime(anime_id);
      res.json({ message: `${task_ids.length} episodios encolados para el anime`, task_ids });
    } catch (error: any) {
      console.error(`Error encolando anime ${anime_id}:`, error);
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
