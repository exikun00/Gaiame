import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../index.js';

describe('API Integration Tests', () => {
  it('GET /api/health debe responder 200 con status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });

  it('GET /api/downloads/storage debe responder 200 con estadísticas de uso', async () => {
    const res = await request(app).get('/api/downloads/storage');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('used_bytes');
    expect(res.body).toHaveProperty('episode_count');
  });

  it('GET /api/stream/local/:episodeId inexistente debe retornar 404', async () => {
    const res = await request(app).get('/api/stream/local/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('GET /api/stream/local/:episodeId con slug sintético inexistente debe retornar 404', async () => {
    const res = await request(app).get('/api/stream/local/anime-no-existente-999');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('GET /api/anime/search sin parámetro q debe responder 400', async () => {
    const res = await request(app).get('/api/anime/search');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('GET /api/anime/search?q=naruto debe responder 200 con resultados válidos', async () => {
    const res = await request(app).get('/api/anime/search?q=naruto');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('results');
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(res.body.results.length).toBeGreaterThan(0);
    const first = res.body.results[0];
    expect(first).toHaveProperty('slug');
    expect(first).toHaveProperty('title');
  }, 15000);

  it('GET /api/anime/search con término inexistente debe responder 200 con array vacío', async () => {
    const res = await request(app).get('/api/anime/search?q=xyznonexistentanime123456');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('results');
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(res.body.results.length).toBe(0);
  }, 15000);

  it('GET /api/anime/kanojo-ga-flag-wo-oraretara debe retornar la portada correcta del anime y no la del sidebar', async () => {
    const res = await request(app).get('/api/anime/kanojo-ga-flag-wo-oraretara');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('posterUrl');
    expect(res.body.posterUrl).toContain('kanojo-ga-flag-wo-oraretara.jpg');
    expect(res.body.posterUrl).not.toContain('little-busters.jpg');
  }, 15000);
});
