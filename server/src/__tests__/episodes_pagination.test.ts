import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../index.js';

describe('Episodes Pagination & Range API', () => {
  it('GET /api/anime/:slug debe responder con episodesCount y los primeros 16 capítulos rápidamente', async () => {
    const start_time = Date.now();
    const res = await request(app).get('/api/anime/detective-conan');
    const elapsed = Date.now() - start_time;

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('episodesCount');
    expect(res.body.episodesCount).toBeGreaterThanOrEqual(1200);
    expect(res.body).toHaveProperty('totalPages');
    expect(res.body.totalPages).toBeGreaterThanOrEqual(75);
    expect(res.body).toHaveProperty('seasons');
    expect(res.body.seasons[0].episodes.length).toBe(16);
    expect(res.body.seasons[0].episodes[0].number).toBe(1);
    expect(res.body.seasons[0].episodes[15].number).toBe(16);
    // Verificamos que responda rápidamente (menos de 3 segundos la primera vez)
    expect(elapsed).toBeLessThan(4000);
  }, 10000);

  it('GET /api/anime/:slug/episodes?page=2 debe retornar exactamente los capítulos 17 al 32', async () => {
    const res = await request(app).get('/api/anime/detective-conan/episodes?page=2');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('episodes');
    expect(res.body.episodes.length).toBe(16);
    expect(res.body.current_page).toBe(2);
    expect(res.body.episodes[0].number).toBe(17);
    expect(res.body.episodes[15].number).toBe(32);
  }, 10000);

  it('GET /api/anime/:slug/episodes?start=6&end=10 debe retornar exactamente el bloque de 5 capítulos (múltiplos de 5)', async () => {
    const res = await request(app).get('/api/anime/detective-conan/episodes?start=6&end=10');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('episodes');
    expect(res.body.episodes.length).toBe(5);
    expect(res.body.episodes.map((e: any) => e.number)).toEqual([6, 7, 8, 9, 10]);
  }, 10000);

  it('GET /api/anime/:slug/episodes?episode=500 debe retornar la página correspondiente que contiene el capítulo 500', async () => {
    const res = await request(app).get('/api/anime/detective-conan/episodes?episode=500');
    expect(res.status).toBe(200);
    expect(res.body.current_page).toBe(32); // Math.ceil(500 / 16) = 32
    expect(res.body.episodes.some((e: any) => e.number === 500)).toBe(true);
  }, 10000);
});
