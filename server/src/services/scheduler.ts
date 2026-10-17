import cron from 'node-cron';
import prisma from './prisma.js';
import storageService from './storage.js';
import jkanimeScraper from './scraper.js';
import logger, { userLogger, syncLogSymlinks } from '../utils/logger.js';

export class SchedulerService {
  private is_purging: boolean = false;
  private is_syncing: boolean = false;

  public init(): void {
    logger.info('⏰ Inicializando tareas programadas del servidor (cron)...');

    // 1. Tarea horaria: Borrado diferido de animes con inWatchlist = false
    cron.schedule('0 * * * *', async () => {
      logger.info('[Scheduler] Ejecutando tarea horaria de purga diferida...');
      await this.runDeferredPurge();
    });

    // 2. Tarea diaria a las 03:00 AM: Sincronización de metadatos de animes en Watchlist
    cron.schedule('0 3 * * *', async () => {
      logger.info('[Scheduler] Ejecutando sincronización diaria de metadatos (03:00 AM)...');
      await this.runDailyMetadataSync();
    });

    // 3. Tarea de sincronización de symlinks diarios a las 00:01 AM
    cron.schedule('1 0 * * *', () => {
      syncLogSymlinks();
    });

    logger.info('✅ Tareas programadas configuradas: [Purga horaria diferida], [Sync diario 03:00 AM]');
  }

  /**
   * Purga diferida por lotes:
   * Busca animes con inWatchlist = false y los elimina definitivamente junto con sus archivos físicos.
   */
  public async runDeferredPurge(): Promise<number> {
    if (this.is_purging) {
      logger.warn('[Scheduler] Tarea de purga ya se encuentra en ejecución, omitiendo ciclo');
      return 0;
    }

    this.is_purging = true;
    let purged_count = 0;

    try {
      const unlisted_animes = await prisma.anime.findMany({
        where: { inWatchlist: false },
      });

      if (unlisted_animes.length === 0) {
        logger.info('[Scheduler] No hay animes pendientes de purga diferida');
        return 0;
      }

      logger.info({ count: unlisted_animes.length }, '[Scheduler] Purgando animes marcados fuera de la watchlist...');

      for (const anime of unlisted_animes) {
        try {
          // Eliminar archivos físicos (episodios, carátula, miniaturas)
          await storageService.deleteAnimeFiles(anime.slug);

          // Eliminar de la base de datos (cascada sobre seasons, episodes, tasks)
          await prisma.anime.delete({
            where: { id: anime.id },
          });

          purged_count++;
          userLogger.info(
            { action: 'PURGE_DEFERRED_ANIME', slug: anime.slug, title: anime.title },
            `[Purga Diferida] Anime ${anime.title} y sus archivos locales eliminados definitivamente`
          );
        } catch (item_err) {
          logger.error({ anime: anime.slug, error: item_err }, '[Scheduler] Error purgando anime');
        }
      }

      logger.info({ purged_count }, '[Scheduler] Purga diferida completada con éxito');
    } catch (error) {
      logger.error({ error }, '[Scheduler] Error en la ejecución de la purga diferida');
    } finally {
      this.is_purging = false;
    }

    return purged_count;
  }

  /**
   * Sincronización diaria a las 03:00 AM:
   * Actualiza los datos de los animes en Watchlist y descarga miniaturas de nuevos episodios emitidos.
   */
  public async runDailyMetadataSync(): Promise<void> {
    if (this.is_syncing) {
      logger.warn('[Scheduler] Sincronización de metadatos ya en curso, omitiendo ciclo');
      return;
    }

    this.is_syncing = true;

    try {
      const watchlist_animes = await prisma.anime.findMany({
        where: { inWatchlist: true },
        include: {
          seasons: {
            include: { episodes: true },
          },
        },
      });

      logger.info({ count: watchlist_animes.length }, '[Scheduler] Sincronizando animes en Watchlist...');

      for (const anime of watchlist_animes) {
        try {
          const scraped = await jkanimeScraper.getAnimeDetails(anime.slug);
          if (!scraped) continue;

          // Asegurar que la carátula esté en disco
          const local_poster = await storageService.saveAnimeCover(anime.slug, scraped.poster_url);

          // Actualizar metadatos del anime
          await prisma.anime.update({
            where: { id: anime.id },
            data: {
              status: scraped.status,
              synopsis: scraped.synopsis,
              genres: scraped.genres,
              episodesCount: scraped.episodes_count || anime.episodesCount,
              studios: scraped.studios || anime.studios,
              seasonName: scraped.season_name || anime.seasonName,
              posterUrl: local_poster || anime.posterUrl,
            },
          });

          // Si hay episodios nuevos, registrarlos y descargar miniaturas
          if (scraped.anime_id && scraped.csrf_token) {
            const season = anime.seasons[0];
            if (season) {
              const scraped_episodes = await jkanimeScraper.getAllAnimeEpisodes(
                scraped.anime_id,
                scraped.csrf_token
              );

              const existing_ep_numbers = new Set(season.episodes.map((e) => e.number));

              for (const ep of scraped_episodes) {
                // Descargar miniatura local
                const local_thumb = ep.image
                  ? await storageService.saveEpisodeThumbnail(anime.slug, ep.number, ep.image)
                  : null;

                if (!existing_ep_numbers.has(ep.number)) {
                  await prisma.episode.create({
                    data: {
                      seasonId: season.id,
                      number: ep.number,
                      title: ep.title,
                      image: local_thumb || ep.image,
                      downloadStatus: 'PENDING',
                    },
                  });
                  logger.info({ slug: anime.slug, episode: ep.number }, '[Scheduler] Nuevo episodio detectado y registrado');
                } else if (local_thumb) {
                  // Si ya existía pero no tenía miniatura local, actualizarla
                  const existing_ep = season.episodes.find((e) => e.number === ep.number);
                  if (existing_ep && existing_ep.image !== local_thumb) {
                    await prisma.episode.update({
                      where: { id: existing_ep.id },
                      data: { image: local_thumb },
                    });
                  }
                }
              }
            }
          }
        } catch (anime_err) {
          logger.warn({ slug: anime.slug, error: anime_err }, '[Scheduler] Error sincronizando anime');
        }
      }

      logger.info('[Scheduler] Sincronización diaria de metadatos finalizada');
    } catch (error) {
      logger.error({ error }, '[Scheduler] Error en la tarea diaria de sincronización');
    } finally {
      this.is_syncing = false;
    }
  }
}

export const schedulerService = new SchedulerService();
export default schedulerService;
