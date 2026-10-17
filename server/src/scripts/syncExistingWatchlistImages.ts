import prisma from '../services/prisma.js';
import storageService from '../services/storage.js';
import jkanimeScraper from '../services/scraper.js';
import logger from '../utils/logger.js';

async function main() {
  logger.info('Iniciando sincronización y descarga local de imágenes para animes en Watchlist...');

  const watchlist_animes = await prisma.anime.findMany({
    where: { inWatchlist: true },
    include: {
      seasons: {
        include: { episodes: true },
      },
    },
  });

  logger.info({ count: watchlist_animes.length }, 'Animes en Watchlist encontrados');

  for (const anime of watchlist_animes) {
    logger.info({ slug: anime.slug }, 'Sincronizando carátula y miniaturas');

    // 1. Descargar carátula
    let cover_url = anime.posterUrl;
    if (!cover_url || !cover_url.startsWith('/api/storage/covers/')) {
      const remote_cover = `https://cdn.jkdesa.com/assets/images/animes/image/${anime.slug}.jpg`;
      const local_cover = await storageService.saveAnimeCover(anime.slug, remote_cover);
      if (local_cover) {
        await prisma.anime.update({
          where: { id: anime.id },
          data: { posterUrl: local_cover },
        });
        logger.info({ slug: anime.slug, local_cover }, 'Carátula local guardada y actualizada en BD');
      }
    }

    // 2. Descargar miniaturas de episodios
    for (const season of anime.seasons) {
      for (const ep of season.episodes) {
        if (!ep.image || !ep.image.startsWith('/api/storage/thumbnails/')) {
          let remote_img = ep.image;
          if (!remote_img || !remote_img.startsWith('http')) {
            // Obtener de scraping si no está disponible
            const details = await jkanimeScraper.getAnimeDetails(anime.slug);
            if (details?.anime_id && details?.csrf_token) {
              const scraped_eps = await jkanimeScraper.getAllAnimeEpisodes(details.anime_id, details.csrf_token);
              const matched = scraped_eps.find((e) => e.number === ep.number);
              if (matched?.image) remote_img = matched.image;
            }
          }

          if (remote_img && remote_img.startsWith('http')) {
            const local_thumb = await storageService.saveEpisodeThumbnail(anime.slug, ep.number, remote_img);
            if (local_thumb) {
              await prisma.episode.update({
                where: { id: ep.id },
                data: { image: local_thumb },
              });
              logger.info({ slug: anime.slug, episode: ep.number, local_thumb }, 'Miniatura guardada');
            }
          }
        }
      }
    }
  }

  logger.info('Sincronización de imágenes finalizada.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error sincronizando imágenes:', err);
  process.exit(1);
});
