/**
 * Constantes y configuración global del servidor Gaiame
 */

export const ANIME_BASE_URL: string = (
  process.env.ANIME_BASE_URL || 'https://jkanime.net/'
).replace(/\/+$/, '') + '/';

export const ANIME_BASE_ORIGIN: string = ANIME_BASE_URL.replace(/\/+$/, '');

export const DEFAULT_USER_AGENT: string =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
