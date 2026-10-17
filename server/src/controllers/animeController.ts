import { Request, Response } from 'express';
import prisma from '../services/prisma.js';
import jkanimeScraper from '../services/scraper.js';
import storageService from '../services/storage.js';
import logger, { userLogger } from '../utils/logger.js';

export class AnimeController {
  public async search(req: Request, res: Response): Promise<void> {
    const raw_query = req.query['q'];
    const query = typeof raw_query === 'string' ? raw_query : '';

    const raw_page = req.query['page'];
    const page = typeof raw_page === 'string' ? parseInt(raw_page, 10) : 1;

    if (!query) {
      res.status(400).json({ error: 'Parámetro de búsqueda "q" es requerido' });
      return;
    }

    try {
      const search_result = await jkanimeScraper.searchAnime(query, page);
      if (search_result.results && search_result.results.length > 0) {
        res.json(search_result);
        return;
      }
    } catch (error) {
      logger.warn({ query }, 'Fallo de búsqueda en JKAnime (posible desconexión). Consultando biblioteca local...');
    }

    // Fallback a animes en Watchlist cacheados en PostgreSQL para búsqueda offline
    try {
      const local_animes = await prisma.anime.findMany({
        where: {
          inWatchlist: true,
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { slug: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: 20,
      });

      res.json({
        results: local_animes.map((a) => ({
          slug: a.slug,
          title: a.title,
          poster_url: a.posterUrl,
          type: a.type || 'Serie',
          synopsis: a.synopsis,
        })),
        total_pages: 1,
      });
    } catch (db_error) {
      console.error(`Error buscando anime en biblioteca local (${query}):`, db_error);
      res.status(500).json({ error: 'Error realizando búsqueda' });
    }
  }

  public async getLatest(_req: Request, res: Response): Promise<void> {
    try {
      const latest = await jkanimeScraper.getLatestReleases();
      res.json({ results: latest });
    } catch (error) {
      console.error('Error obteniendo últimos lanzamientos:', error);
      res.status(500).json({ error: 'Error obteniendo estrenos' });
    }
  }

  public async getCatalog(_req: Request, res: Response): Promise<void> {
    try {
      const animes = await prisma.anime.findMany({
        where: { inWatchlist: true },
        orderBy: { updatedAt: 'desc' },
        include: {
          seasons: {
            orderBy: { number: 'asc' },
            include: {
              episodes: {
                orderBy: { number: 'asc' },
              },
            },
          },
        },
      });

      const serialized = animes.map((a) => ({
        ...a,
        seasons: a.seasons.map((s) => ({
          ...s,
          episodes: s.episodes.map((ep) => ({
            ...ep,
            fileSizeBytes: ep.fileSizeBytes ? ep.fileSizeBytes.toString() : null,
          })),
        })),
      }));

      res.json({ catalog: serialized });
    } catch (error) {
      logger.error({ error }, 'Error obteniendo catálogo de animes guardados');
      res.status(500).json({ error: 'Error obteniendo catálogo' });
    }
  }

  /**
   * Obtiene la ficha técnica y episodios de un anime.
   * NO persiste automáticamente en la base de datos al explorar para no contaminar el almacenamiento.
   */
  public async getDetails(req: Request, res: Response): Promise<void> {
    const raw_slug = req.params['slug'];
    const slug = typeof raw_slug === 'string' ? raw_slug : '';

    if (!slug) {
      res.status(400).json({ error: 'Slug de anime es requerido' });
      return;
    }

    try {
      // 1. Verificar si ya existe en la base de datos local (en Watchlist)
      const existing_anime = await prisma.anime.findUnique({
        where: { slug },
        include: {
          seasons: {
            orderBy: { number: 'asc' },
            include: {
              episodes: {
                orderBy: { number: 'asc' },
              },
            },
          },
        },
      });

      if (existing_anime && existing_anime.seasons.length > 0 && (existing_anime.seasons[0]?.episodes.length ?? 0) > 0) {
        const serialized = {
          ...existing_anime,
          seasons: existing_anime.seasons.map((s) => ({
            ...s,
            episodes: s.episodes.map((ep) => ({
              ...ep,
              fileSizeBytes: ep.fileSizeBytes ? ep.fileSizeBytes.toString() : null,
            })),
          })),
        };
        res.json(serialized);
        return;
      }

      // 2. Si no está en BD local, obtener en vivo desde JKAnime mediante scraping
      logger.info({ slug }, 'Consultando ficha de anime en vivo desde JKAnime (sin persistir en BD)');
      const scraped_details = await jkanimeScraper.getAnimeDetails(slug);

      if (!scraped_details) {
        res.status(404).json({ error: 'Anime no encontrado en JKAnime ni en base de datos local' });
        return;
      }

      let episodes_list: Array<{
        id: string;
        number: number;
        title: string;
        image: string | null;
        downloadStatus: string;
        filePath: null;
        fileSizeBytes: null;
        downloadProgress: number;
      }> = [];

      if (scraped_details.anime_id && scraped_details.csrf_token) {
        const scraped_eps = await jkanimeScraper.getAllAnimeEpisodes(
          scraped_details.anime_id,
          scraped_details.csrf_token
        );

        episodes_list = scraped_eps.map((ep) => ({
          id: `${slug}-${ep.number}`,
          number: ep.number,
          title: ep.title,
          image: ep.image || null,
          downloadStatus: 'PENDING',
          filePath: null,
          fileSizeBytes: null,
          downloadProgress: 0,
        }));
      }

      // Devolver los datos directamente al frontend SIN guardarlos en PostgreSQL
      const transient_anime = {
        id: `transient-${slug}`,
        slug,
        title: scraped_details.title,
        posterUrl: scraped_details.poster_url,
        synopsis: scraped_details.synopsis,
        genres: scraped_details.genres,
        status: scraped_details.status,
        type: scraped_details.type || 'Serie',
        studios: scraped_details.studios || null,
        seasonName: scraped_details.season_name || null,
        languages: scraped_details.languages || null,
        episodesCount: scraped_details.episodes_count || episodes_list.length,
        duration: scraped_details.duration || null,
        aired: scraped_details.aired || null,
        inWatchlist: false,
        seasons: [
          {
            id: `transient-s1-${slug}`,
            number: 1,
            title: 'Temporada 1',
            episodes: episodes_list,
          },
        ],
      };

      res.json(transient_anime);
    } catch (error) {
      console.error(`Error obteniendo detalles del anime (${slug}):`, error);
      res.status(500).json({ error: 'Error obteniendo detalles del anime' });
    }
  }

  /**
   * Alterna el estado en Watchlist.
   * Si se agrega: persiste el anime y descarga carátula y miniaturas locales.
   * Si se quita: establece inWatchlist = false con borrado diferido (la tarea horaria purga si no se revierte).
   */
  public async toggleWatchlist(req: Request, res: Response): Promise<void> {
    const raw_slug = req.params['slug'];
    const slug = typeof raw_slug === 'string' ? raw_slug : '';

    if (!slug) {
      res.status(400).json({ error: 'Slug de anime es requerido' });
      return;
    }

    try {
      let anime = await prisma.anime.findUnique({
        where: { slug },
        include: {
          seasons: {
            include: { episodes: true },
          },
        },
      });

      if (!anime) {
        // El anime no existía en BD; obtener ficha de JKAnime y persistirlo con inWatchlist = true
        logger.info({ slug }, 'Guardando nuevo anime en biblioteca con descarga de portadas locales');
        const scraped = await jkanimeScraper.getAnimeDetails(slug);
        if (!scraped) {
          res.status(404).json({ error: 'Anime no encontrado en JKAnime' });
          return;
        }

        // Descarga de carátula local
        const local_poster = await storageService.saveAnimeCover(slug, scraped.poster_url);

        anime = await prisma.anime.create({
          data: {
            slug,
            title: scraped.title,
            posterUrl: local_poster || scraped.poster_url,
            synopsis: scraped.synopsis,
            genres: scraped.genres,
            status: scraped.status,
            type: scraped.type || 'Serie',
            studios: scraped.studios || null,
            seasonName: scraped.season_name || null,
            languages: scraped.languages || null,
            episodesCount: scraped.episodes_count || null,
            duration: scraped.duration || null,
            aired: scraped.aired || null,
            inWatchlist: true,
          },
          include: {
            seasons: {
              include: { episodes: true },
            },
          },
        });

        const season = await prisma.season.create({
          data: {
            animeId: anime.id,
            number: 1,
            title: 'Temporada 1',
          },
        });

        if (scraped.anime_id && scraped.csrf_token) {
          const scraped_episodes = await jkanimeScraper.getAllAnimeEpisodes(
            scraped.anime_id,
            scraped.csrf_token
          );

          for (const ep of scraped_episodes) {
            // Descargar miniatura local
            const local_thumb = ep.image
              ? await storageService.saveEpisodeThumbnail(slug, ep.number, ep.image)
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
          }
        }

        userLogger.info(
          { action: 'WATCHLIST_ADD', slug, title: anime.title },
          `[Watchlist] Anime ${anime.title} agregado a la biblioteca`
        );

        res.json({ inWatchlist: true });
        return;
      }

      // Si ya existía en la base de datos, alternar inWatchlist
      const new_state = !anime.inWatchlist;
      const updated = await prisma.anime.update({
        where: { slug },
        data: { inWatchlist: new_state },
      });

      if (new_state) {
        // Si se volvió a activar la watchlist, asegurar carátula y miniaturas locales
        void storageService.saveAnimeCover(slug, anime.posterUrl);
        userLogger.info(
          { action: 'WATCHLIST_RESTORED', slug, title: anime.title },
          `[Watchlist] Anime ${anime.title} reactivado en la biblioteca`
        );
      } else {
        // Si se desmarca, registrar el evento. La tarea horaria se encargará de purgarlo si no se reactiva.
        userLogger.info(
          { action: 'WATCHLIST_REMOVE_PENDING_PURGE', slug, title: anime.title },
          `[Watchlist] Anime ${anime.title} desmarcado de la biblioteca (borrado diferido programado)`
        );
      }

      res.json({ inWatchlist: updated.inWatchlist });
    } catch (error) {
      console.error(`Error alternando watchlist (${slug}):`, error);
      res.status(500).json({ error: 'Error actualizando watchlist' });
    }
  }

  public async getWatchlist(_req: Request, res: Response): Promise<void> {
    try {
      const watchlist = await prisma.anime.findMany({
        where: { inWatchlist: true },
        orderBy: { updatedAt: 'desc' },
        include: {
          seasons: {
            include: {
              episodes: {
                select: {
                  id: true,
                  number: true,
                  downloadStatus: true,
                },
              },
            },
          },
        },
      });

      res.json({ watchlist });
    } catch (error) {
      console.error('Error obteniendo watchlist:', error);
      res.status(500).json({ error: 'Error obteniendo biblioteca' });
    }
  }

  /**
   * Garantiza que un anime y sus episodios existan en la base de datos local.
   * Utilizado cuando se solicita la descarga de un episodio de un anime que aún no estaba en la base de datos.
   */
  public async ensureAnimePersisted(slug: string): Promise<any> {
    let anime = await prisma.anime.findUnique({
      where: { slug },
      include: {
        seasons: {
          include: { episodes: true },
        },
      },
    });

    if (anime && anime.seasons.length > 0 && (anime.seasons[0]?.episodes.length ?? 0) > 0) {
      return anime;
    }

    const scraped = await jkanimeScraper.getAnimeDetails(slug);
    if (!scraped) {
      throw new Error(`Anime no encontrado para persistir: ${slug}`);
    }

    const local_cover = await storageService.saveAnimeCover(slug, scraped.poster_url);

    anime = await prisma.anime.upsert({
      where: { slug },
      update: {
        posterUrl: local_cover || scraped.poster_url,
      },
      create: {
        slug,
        title: scraped.title,
        posterUrl: local_cover || scraped.poster_url,
        synopsis: scraped.synopsis,
        genres: scraped.genres,
        status: scraped.status,
        type: scraped.type || 'Serie',
        studios: scraped.studios || null,
        seasonName: scraped.season_name || null,
        languages: scraped.languages || null,
        episodesCount: scraped.episodes_count || null,
        duration: scraped.duration || null,
        aired: scraped.aired || null,
        inWatchlist: true, // Al descargarse, se incorpora a la biblioteca de interés
      },
      include: {
        seasons: {
          include: { episodes: true },
        },
      },
    });

    let season = anime.seasons[0];
    if (!season) {
      season = await prisma.season.create({
        data: {
          animeId: anime.id,
          number: 1,
          title: 'Temporada 1',
        },
        include: { episodes: true },
      });
    }

    if (scraped.anime_id && scraped.csrf_token) {
      const scraped_episodes = await jkanimeScraper.getAllAnimeEpisodes(
        scraped.anime_id,
        scraped.csrf_token
      );

      for (const ep of scraped_episodes) {
        const local_thumb = ep.image
          ? await storageService.saveEpisodeThumbnail(slug, ep.number, ep.image)
          : null;

        await prisma.episode.upsert({
          where: {
            seasonId_number: {
              seasonId: season.id,
              number: ep.number,
            },
          },
          update: {
            image: local_thumb || ep.image,
          },
          create: {
            seasonId: season.id,
            number: ep.number,
            title: ep.title,
            image: local_thumb || ep.image,
            downloadStatus: 'PENDING',
          },
        });
      }
    }

    return await prisma.anime.findUnique({
      where: { slug },
      include: {
        seasons: {
          include: { episodes: true },
        },
      },
    });
  }
}

export const animeController = new AnimeController();
export default animeController;
