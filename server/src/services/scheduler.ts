import cron from 'node-cron';
import prisma from './prisma.js';
import storageService from './storage.js';
import jkanimeScraper from './scraper.js';
import franchiseService from './franchiseService.js';
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
      // Purgar únicamente animes fuera de la watchlist que NO tengan episodios descargados ni descargas activas
      const unlisted_animes = await prisma.anime.findMany({
        where: {
          inWatchlist: false,
          seasons: {
            none: {
              episodes: {
                some: {
                  OR: [
                    { downloadStatus: 'COMPLETED' },
                    { filePath: { not: null } },
                    {
                      downloadTasks: {
                        some: {
                          status: { in: ['PENDING', 'DOWNLOADING'] },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
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

      // Purga de franquicias huérfanas
      try {
        const purged_franchises = await franchiseService.purgeOrphanFranchises();
        if (purged_franchises > 0) {
          logger.info({ purged_franchises }, '[Scheduler] Franquicias huérfanas purgadas');
        }
      } catch (f_err) {
        logger.error({ error: f_err }, '[Scheduler] Error purgando franquicias huérfanas');
      }
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

          // Si hay episodios nuevos, registrarlos
          if (scraped.anime_id && scraped.csrf_token) {
            const season = anime.seasons[0];
            if (season) {
              // Consultar la última página de episodios para detectar nuevos lanzamientos sin saturar JKAnime
              const first_batch = await jkanimeScraper.getAnimeEpisodes(
                scraped.anime_id,
                1,
                scraped.csrf_token
              );
              let latest_episodes = first_batch.episodes;
              if (first_batch.last_page > 1) {
                const last_batch = await jkanimeScraper.getAnimeEpisodes(
                  scraped.anime_id,
                  first_batch.last_page,
                  scraped.csrf_token
                );
                latest_episodes = [...latest_episodes, ...last_batch.episodes];
              }

              const existing_ep_numbers = new Set(season.episodes.map((e) => e.number));

              for (const ep of latest_episodes) {
                if (!existing_ep_numbers.has(ep.number)) {
                  // Descargar miniatura únicamente para episodios nuevos
                  const local_thumb = ep.image
                    ? await storageService.saveEpisodeThumbnail(anime.slug, ep.number, ep.image)
                    : null;

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
                }
              }
            }
          }
        } catch (anime_err) {
          logger.warn({ slug: anime.slug, error: anime_err }, '[Scheduler] Error sincronizando anime');
        }
      }

      // Sincronizar franquicias de la watchlist con AniList para detectar nuevas temporadas
      try {
        await franchiseService.syncWatchlistFranchises();
      } catch (f_sync_err) {
        logger.error({ error: f_sync_err }, '[Scheduler] Error sincronizando franquicias de watchlist');
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
