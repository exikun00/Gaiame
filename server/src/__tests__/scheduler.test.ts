import { describe, it, expect } from 'vitest';
import prisma from '../services/prisma.js';
import schedulerService from '../services/scheduler.js';
import storageService from '../services/storage.js';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

describe('Scheduler Service & Deferred Purge', () => {
  it('runDeferredPurge debe eliminar únicamente animes con inWatchlist = false y sus archivos', async () => {
    const slug = 'vitest-temp-unlisted';

    // 1. Crear anime temporal
    await prisma.anime.upsert({
      where: { slug },
      update: { inWatchlist: false },
      create: {
        slug,
        title: 'Vitest Temp Unlisted',
        posterUrl: '/api/storage/covers/vitest-temp-unlisted.jpg',
        synopsis: 'Temp for testing',
        genres: ['Test'],
        inWatchlist: false,
      },
    });

    // 2. Crear archivos físicos ficticios
    const dummy_cover = storageService.getCoverPath(slug);
    await fs.mkdir(path.dirname(dummy_cover), { recursive: true });
    await fs.writeFile(dummy_cover, 'cover data');

    expect(existsSync(dummy_cover)).toBe(true);

    // 3. Ejecutar purga diferida
    const purged = await schedulerService.runDeferredPurge();
    expect(purged).toBeGreaterThanOrEqual(1);

    // 4. Verificar que se eliminó el archivo y el registro en la BD
    expect(existsSync(dummy_cover)).toBe(false);
    const db_entry = await prisma.anime.findUnique({ where: { slug } });
    expect(db_entry).toBeNull();

    // 5. Verificar que animes en watchlist siguen intactos
    const kanojo = await prisma.anime.findUnique({ where: { slug: 'kanojo-ga-flag-wo-oraretara' } });
    expect(kanojo?.inWatchlist).toBe(true);
  });

  it('runDeferredPurge NO debe eliminar animes fuera de watchlist si tienen episodios descargados', async () => {
    const slug = 'vitest-downloaded-unlisted';

    // 1. Crear anime temporal fuera de la watchlist
    const anime = await prisma.anime.upsert({
      where: { slug },
      update: { inWatchlist: false },
      create: {
        slug,
        title: 'Vitest Downloaded Unlisted',
        posterUrl: '/api/storage/covers/vitest-downloaded-unlisted.jpg',
        synopsis: 'Anime with downloaded episode not in watchlist',
        genres: ['Test'],
        inWatchlist: false,
      },
    });

    const season = await prisma.season.upsert({
      where: { animeId_number: { animeId: anime.id, number: 1 } },
      update: {},
      create: {
        animeId: anime.id,
        number: 1,
        title: 'Temporada 1',
      },
    });

    await prisma.episode.upsert({
      where: { seasonId_number: { seasonId: season.id, number: 1 } },
      update: { downloadStatus: 'COMPLETED', filePath: '/fake/path/ep1.mp4' },
      create: {
        seasonId: season.id,
        number: 1,
        title: 'Episodio 1',
        downloadStatus: 'COMPLETED',
        filePath: '/fake/path/ep1.mp4',
      },
    });

    // 2. Ejecutar purga
    await schedulerService.runDeferredPurge();

    // 3. Verificar que el anime sigue existiendo en base de datos
    const preserved = await prisma.anime.findUnique({ where: { slug } });
    expect(preserved).not.toBeNull();
    expect(preserved?.inWatchlist).toBe(false);

    // Limpieza posterior
    await prisma.anime.delete({ where: { slug } });
  });
});
