import { Request, Response } from 'express';
import prisma from '../services/prisma.js';
import logger from '../utils/logger.js';

export class HistoryController {
  /**
   * Obtiene la lista del historial de visualización.
   * Soporta filtros de búsqueda, ordenamiento y límite.
   */
  public async getHistory(req: Request, res: Response): Promise<void> {
    try {
      const limit_raw = req.query['limit'];
      const take = limit_raw ? parseInt(limit_raw as string, 10) : 50;

      const sort_raw = (req.query['sort'] as string) || 'date';
      const order_raw = (req.query['order'] as string) || 'desc';
      const sort_direction: 'asc' | 'desc' = order_raw.toLowerCase() === 'asc' ? 'asc' : 'desc';

      const query_filter = (req.query['q'] as string)?.trim();

      const where_clause: any = {};
      if (query_filter) {
        where_clause.OR = [
          { animeTitle: { contains: query_filter, mode: 'insensitive' } },
          { animeSlug: { contains: query_filter, mode: 'insensitive' } },
        ];
      }

      let order_by: any = { updatedAt: sort_direction };
      if (sort_raw === 'title') {
        order_by = { animeTitle: sort_direction };
      } else if (sort_raw === 'progress') {
        order_by = { progressSec: sort_direction };
      }

      const [history, total] = await Promise.all([
        prisma.watchHistory.findMany({
          where: where_clause,
          orderBy: order_by,
          take,
        }),
        prisma.watchHistory.count({ where: where_clause }),
      ]);

      res.json({ history, total });
    } catch (error) {
      logger.error({ error }, 'Error obteniendo historial de reproducción');
      res.status(500).json({ error: 'Error obteniendo historial de reproducción' });
    }
  }

  /**
   * Registra o actualiza el progreso de visualización de un episodio.
   */
  public async updateProgress(req: Request, res: Response): Promise<void> {
    try {
      const {
        animeSlug,
        animeTitle,
        posterUrl,
        episodeNum,
        episodeId,
        progressSec = 0,
        durationSec = 0,
        completed,
      } = req.body;

      if (!animeSlug || episodeNum === undefined) {
        res.status(400).json({ error: 'animeSlug y episodeNum son requeridos' });
        return;
      }

      const ep_num = parseInt(episodeNum, 10);
      const is_completed =
        completed ?? (durationSec > 0 ? progressSec / durationSec >= 0.88 : false);

      const record = await prisma.watchHistory.upsert({
        where: {
          animeSlug_episodeNum: {
            animeSlug,
            episodeNum: ep_num,
          },
        },
        update: {
          animeTitle: animeTitle || animeSlug,
          posterUrl: posterUrl || '',
          episodeId: episodeId || null,
          progressSec: Number(progressSec),
          durationSec: Number(durationSec),
          completed: is_completed,
        },
        create: {
          animeSlug,
          animeTitle: animeTitle || animeSlug,
          posterUrl: posterUrl || '',
          episodeNum: ep_num,
          episodeId: episodeId || null,
          progressSec: Number(progressSec),
          durationSec: Number(durationSec),
          completed: is_completed,
        },
      });

      res.json({ success: true, record });
    } catch (error) {
      logger.error({ error }, 'Error actualizando progreso en historial');
      res.status(500).json({ error: 'Error actualizando progreso' });
    }
  }

  /**
   * Elimina un elemento individual del historial por ID.
   */
  public async deleteItem(req: Request, res: Response): Promise<void> {
    const id = req.params['id'] as string;
    if (!id) {
      res.status(400).json({ error: 'id es requerido' });
      return;
    }

    try {
      await prisma.watchHistory.delete({
        where: { id },
      });
      res.json({ success: true, message: 'Elemento eliminado del historial' });
    } catch (error) {
      logger.error({ id, error }, 'Error eliminando elemento del historial');
      res.status(500).json({ error: 'Error eliminando elemento del historial' });
    }
  }

  /**
   * Vacía el historial de reproducción completo.
   */
  public async clearHistory(_req: Request, res: Response): Promise<void> {
    try {
      const result = await prisma.watchHistory.deleteMany();
      res.json({ success: true, count: result.count, message: 'Historial vaciado con éxito' });
    } catch (error) {
      logger.error({ error }, 'Error vaciando historial');
      res.status(500).json({ error: 'Error vaciando historial' });
    }
  }
}

export default new HistoryController();
