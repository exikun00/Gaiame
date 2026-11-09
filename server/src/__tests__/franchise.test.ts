import { describe, it, expect } from 'vitest';
import franchiseService from '../services/franchiseService.js';

describe('Franchise Service Tests', () => {
  it('debe derivar correctamente los títulos base de diferentes franquicias', () => {
    expect(franchiseService.deriveBaseTitle('Tokyo Revengers: Santen Sensou-hen')).toBe('Tokyo Revengers');
    expect(franchiseService.deriveBaseTitle('Tokyo Revengers: Seiya Kessen-hen')).toBe('Tokyo Revengers');
    expect(franchiseService.deriveBaseTitle('Re:Zero kara Hajimeru Isekai Seikatsu 3rd Season')).toBe('Re:Zero kara Hajimeru Isekai Seikatsu');
    expect(franchiseService.deriveBaseTitle('Re:Zero kara Hajimeru Isekai Seikatsu: Shin Henshuu-ban')).toBe('Re:Zero kara Hajimeru Isekai Seikatsu');
    expect(franchiseService.deriveBaseTitle('[Locodol]: Christmas Special')).toBe('[Locodol]');
    expect(franchiseService.deriveBaseTitle('[Locodol] Yatte Mita.: Nagarekawa, Annai Shite Mita.')).toBe('[Locodol] Yatte Mita.');
  });

  it('debe extraer el número de temporada de títulos y slugs', () => {
    expect(franchiseService.extractSeasonNumber('Tokyo Revengers 2nd Season')).toBe(2);
    expect(franchiseService.extractSeasonNumber('Re:Zero 3rd Season')).toBe(3);
    expect(franchiseService.extractSeasonNumber('Re:Zero 4th Season')).toBe(4);
    expect(franchiseService.extractSeasonNumber('Serie Temporada 2')).toBe(2);
    expect(franchiseService.extractSeasonNumber(undefined, 'rezero-kara-hajimeru-isekai-seikatsu-2nd-season')).toBe(2);
    expect(franchiseService.extractSeasonNumber('Re:Zero kara Hajimeru Isekai Seikatsu')).toBeUndefined();
  });

  it('debe resolver la franquicia de Tokyo Revengers en estricto orden cronológico sin duplicar carátulas', async () => {
    const res = await franchiseService.getFranchise('tokyo-revengers-santen-sensou-hen', true);
    expect(res.franchiseName).toBe('Tokyo Revengers');
    expect(res.seasons.length).toBeGreaterThanOrEqual(4);

    const slugs = res.seasons.map((s) => s.jkanimeSlug);
    expect(slugs).toContain('tokyo-revengers');
    expect(slugs).toContain('tokyo-revengers-seiya-kessen-hen');
    expect(slugs).toContain('tokyo-revengers-tenjiku-hen');
    expect(slugs).toContain('tokyo-revengers-santen-sensou-hen');

    // Comprobar que no hay anilistIds duplicados entre temporadas diferentes
    const anilistIds = res.seasons.map((s) => s.anilistId).filter((id) => id > 0);
    const uniqueIds = new Set(anilistIds);
    expect(uniqueIds.size).toBe(anilistIds.length);

    // Comprobar que la primera temporada es de 2021
    const s1 = res.seasons.find((s) => s.jkanimeSlug === 'tokyo-revengers');
    expect(s1?.year).toBe(2021);
  }, 15000);

  it('debe resolver la franquicia de Locodol incluso desde el especial navideño sin arrojar 404', async () => {
    const res = await franchiseService.getFranchise('futsuu-no-joshikousei-ga-locodol-yatte-mita-christmas-special', true);
    expect(res.seasons.length).toBeGreaterThanOrEqual(1);
    expect(res.ovas.length).toBeGreaterThanOrEqual(2);
    expect(res.all.length).toBeGreaterThanOrEqual(3);

    const sSlugs = res.all.map((i) => i.jkanimeSlug);
    expect(sSlugs).toContain('futsuu-no-joshikousei-ga-locodol-yatte-mita');
    expect(sSlugs).toContain('futsuu-no-joshikousei-ga-locodol-yatte-mita-nagarekawa-annai-shite-mita');
    expect(sSlugs).toContain('futsuu-no-joshikousei-ga-locodol-yatte-mita-christmas-special');
  }, 15000);

  it('debe resolver Re:Zero manteniendo Shin Henshuuban con su portada sin alterar la temporada 3', async () => {
    const res = await franchiseService.getFranchise('rezero-kara-hajimeru-isekai-seikatsu-3rd-season', true);
    const s3 = res.seasons.find((s) => s.jkanimeSlug === 'rezero-kara-hajimeru-isekai-seikatsu-3rd-season');
    const shin = res.seasons.find((s) => s.jkanimeSlug === 'rezero-kara-hajimeru-isekai-seikatsu-shin-henshuuban');

    expect(s3).toBeDefined();
    expect(shin).toBeDefined();

    // Las carátulas deben ser diferentes
    expect(s3?.coverUrl).not.toBe(shin?.coverUrl);
    // El anilistId de la temporada 3 no debe pertenecer a shin-henshuuban
    expect(s3?.anilistId).not.toBe(shin?.anilistId);
  }, 15000);

  it('debe catalogar Detective Conan en seasons con formato TV y no como OVA', async () => {
    const res = await franchiseService.getFranchise('detective-conan', true);
    expect(res.franchiseName).toBe('Detective Conan');
    const conan = res.seasons.find((s) => s.jkanimeSlug === 'detective-conan');
    expect(conan).toBeDefined();
    expect(conan?.format).toBe('TV');
    expect(conan?.category).toBe('season');

    // Verificar que no se encuentre erróneamente en ovas
    const conanInOva = res.ovas.find((o) => o.jkanimeSlug === 'detective-conan');
    expect(conanInOva).toBeUndefined();
  }, 15000);
});
