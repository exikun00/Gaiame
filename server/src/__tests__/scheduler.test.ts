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
});
