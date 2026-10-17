import { describe, it, expect } from 'vitest';
import storageService from '../services/storage.js';

describe('StorageService', () => {
  it('debe sanitizar slugs eliminando caracteres prohibidos', () => {
    const raw_slug = 'Naruto: Shippuuden / Special * Edition?';
    const clean_slug = storageService.sanitizeSlug(raw_slug);
    expect(clean_slug).toBe('naruto-shippuuden-special-edition');
  });

  it('debe generar rutas relativas organizadas jerárquicamente', () => {
    const rel_path = storageService.getRelativeEpisodePath('Boruto: Naruto', 1, 5);
    expect(rel_path).toBe('downloads/boruto-naruto/temporada-1/episodio-5.mp4');
  });

  it('debe resolver la ruta absoluta conteniendo DATA_DIR', () => {
    const rel_path = 'downloads/naruto/temporada-1/episodio-1.mp4';
    const abs_path = storageService.getAbsoluteEpisodePath(rel_path);
    expect(abs_path).toContain(storageService.getDataDir());
    expect(abs_path.endsWith(rel_path)).toBe(true);
  });
});
