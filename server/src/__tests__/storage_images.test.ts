import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import storageService from '../services/storage.js';
import { existsSync } from 'fs';

describe('Local Images Storage & Endpoints', () => {
  it('GET /api/storage/covers/:filename debe retornar 200 para carátula descargada', async () => {
    const slug = 'kanojo-ga-flag-wo-oraretara';
    const cover_path = storageService.getCoverPath(slug);

    if (existsSync(cover_path)) {
      const res = await request(app).get(`/api/storage/covers/${slug}.jpg`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/image/);
      expect(res.headers['cache-control']).toContain('max-age=2592000');
    }
  });

  it('GET /api/storage/thumbnails/:slug/:number debe retornar 200 para miniatura de episodio', async () => {
    const slug = 'kanojo-ga-flag-wo-oraretara';
    const ep_num = 1;
    const thumb_path = storageService.getThumbnailPath(slug, ep_num);

    if (existsSync(thumb_path)) {
      const res = await request(app).get(`/api/storage/thumbnails/${slug}/${ep_num}.jpg`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/image/);
      expect(res.headers['cache-control']).toContain('max-age=2592000');
    }
  });

  it('GET /api/storage/covers/inexistente-123456.jpg debe manejar fallo con 404', async () => {
    const res = await request(app).get('/api/storage/covers/inexistente-123456-no-exists.jpg');
    expect(res.status).toBe(404);
  });
});
