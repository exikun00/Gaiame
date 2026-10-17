import axios from 'axios';
import * as cheerio from 'cheerio';
import { ScrapedServer } from './scraper.js';
import logger from '../utils/logger.js';

export interface ResolvedStream {
  server_name: string;
  stream_url: string;
  is_hls: boolean;
  headers?: Record<string, string>;
  original_embed_url: string;
}

export class StreamExtractor {
  // Jerarquía optimizada para descargas locales en el servidor
  private static readonly DOWNLOAD_PRIORITIES: Record<string, number> = {
    mediafire: 1000,
    mp4upload: 900,
    desu: 800,
    magi: 750,
    streamtape: 100,
    filemoon: 80,
    vidhide: 60,
    voe: 40,
    mixdrop: 20,
  };

  // Jerarquía para streaming directo en reproductor web
  private static readonly STREAM_PRIORITIES: Record<string, number> = {
    desu: 1000,
    magi: 950,
    mediafire: 900,
    mp4upload: 850,
    mixdrop: 800,
    vidhide: 750,
    filemoon: 700,
    voe: 650,
    streamtape: 600,
  };

  public getDownloadPriority(server_name: string): number {
    const key = server_name.toLowerCase().trim();
    if (key.includes('desuka')) return 0;
    for (const [k, score] of Object.entries(StreamExtractor.DOWNLOAD_PRIORITIES)) {
      if (key.includes(k)) return score;
    }
    return 10;
  }

  public getStreamPriority(server_name: string): number {
    const key = server_name.toLowerCase().trim();
    if (key.includes('desuka')) return 0;
    for (const [k, score] of Object.entries(StreamExtractor.STREAM_PRIORITIES)) {
      if (key.includes(k)) return score;
    }
    return 10;
  }

  public getPriority(server_name: string): number {
    return this.getStreamPriority(server_name);
  }

  public sortServersByPriority(servers: ScrapedServer[]): ScrapedServer[] {
    return [...servers].sort((a, b) => this.getStreamPriority(b.server) - this.getStreamPriority(a.server));
  }

  public sortServersForDownload(servers: ScrapedServer[]): ScrapedServer[] {
    return [...servers].sort((a, b) => this.getDownloadPriority(b.server) - this.getDownloadPriority(a.server));
  }

  /**
   * Determina si un stream es descargable como archivo de video real (HLS o video directo).
   * Los reproductores de solo iframe/embed se descartan para descargas locales en el servidor.
   */
  public isDownloadableStream(stream: ResolvedStream | null): boolean {
    if (!stream || !stream.stream_url) return false;
    if (stream.server_name.toLowerCase().includes('desuka')) return false;

    // Manifiestos HLS descargables con ffmpeg
    if (stream.is_hls || stream.stream_url.includes('.m3u8')) return true;

    // Si la stream_url es idéntica a la embed_url de un reproductor iframe HTML, no se puede descargar directamente
    const is_same_as_embed = stream.stream_url === stream.original_embed_url;
    const url_lower = stream.stream_url.toLowerCase();

    if (
      is_same_as_embed &&
      (url_lower.includes('/e/') ||
        url_lower.includes('/embed') ||
        url_lower.includes('streamtape.com') ||
        url_lower.includes('voe.sx') ||
        url_lower.includes('mixdrop.') ||
        url_lower.includes('bysekoze.com'))
    ) {
      return false;
    }

    // Archivos de video directos binarios
    if (url_lower.includes('.mp4') || url_lower.includes('.mkv') || url_lower.includes('mediafire.com') || url_lower.includes('mp4upload.com:')) {
      return true;
    }

    return false;
  }

  /**
   * Resuelve el servidor más óptimo disponible con fallback automático en cascada.
   */
  public async resolveOptimalStream(servers: ScrapedServer[]): Promise<ResolvedStream | null> {
    if (!servers || servers.length === 0) {
      return null;
    }

    const sorted_candidates = this.sortServersByPriority(servers);

    for (const candidate of sorted_candidates) {
      logger.info({ server: candidate.server, url: candidate.raw_url }, '[StreamExtractor] Evaluando candidato');

      try {
        const resolved = await this.extractStreamFromCandidate(candidate);

        if (resolved && (await this.verifyStreamAvailability(resolved))) {
          logger.info({ server: resolved.server_name, is_hls: resolved.is_hls }, '[StreamExtractor] ✔ Servidor óptimo seleccionado exitosamente');
          return resolved;
        } else {
          logger.warn({ server: candidate.server }, '[StreamExtractor] ✘ Servidor no disponible o archivo eliminado. Pasando al siguiente...');
        }
      } catch (err: any) {
        logger.warn({ server: candidate.server, err: err.message }, '[StreamExtractor] Error extrayendo servidor. Intentando fallback...');
      }
    }

    logger.error('[StreamExtractor] Todos los servidores disponibles fallaron o no contienen el archivo.');
    return null;
  }

  /**
   * Extrae la URL de video según el host permitido. Descarta cualquier host no autorizado.
   */
  public async extractStreamFromCandidate(candidate: ScrapedServer): Promise<ResolvedStream | null> {
    const server_lower = candidate.server.toLowerCase();
    const url = candidate.raw_url;

    if (server_lower.includes('desuka')) {
      logger.warn({ server: candidate.server }, '[StreamExtractor] Desuka descartado permanentemente');
      return null;
    } else if (server_lower.includes('desu')) {
      return this.extractDesu(url, candidate.server);
    } else if (server_lower.includes('magi')) {
      return this.extractMagi(url, candidate.server);
    } else if (server_lower.includes('mediafire')) {
      return this.extractMediafire(url, candidate.server);
    } else if (server_lower.includes('mp4upload')) {
      return this.extractMp4upload(url, candidate.server);
    } else if (server_lower.includes('mixdrop')) {
      return this.extractMixdrop(url, candidate.server);
    } else if (server_lower.includes('vidhide')) {
      return this.extractVidhide(url, candidate.server);
    } else if (server_lower.includes('filemoon')) {
      return this.extractFilemoon(url, candidate.server);
    } else if (server_lower.includes('voe')) {
      return this.extractVoe(url, candidate.server);
    } else if (server_lower.includes('streamtape')) {
      return this.extractStreamtape(url, candidate.server);
    } else {
      logger.warn({ server: candidate.server }, '[StreamExtractor] Servidor no admitido descartado');
      return null;
    }
  }

  private async extractDesu(url: string, server_name: string): Promise<ResolvedStream | null> {
    try {
      const res = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
          Referer: 'https://jkanime.net/',
        },
      });

      const html = res.data;
      if (typeof html !== 'string' || html.includes('404') || html.includes('Not Found') || html.includes('eliminado')) {
        return null;
      }

      const match_video = html.match(/(https?:\/\/[^"'\s,]+\.(?:mp4|m3u8)[^"'\s,]*)/i);
      if (match_video && match_video[1]) {
        const stream_url = match_video[1];
        return {
          server_name,
          stream_url,
          is_hls: stream_url.includes('.m3u8'),
          headers: { Referer: url },
          original_embed_url: url,
        };
      }

      return {
        server_name,
        stream_url: url,
        is_hls: false,
        headers: { Referer: 'https://jkanime.net/' },
        original_embed_url: url,
      };
    } catch {
      return null;
    }
  }

  private async extractMagi(url: string, server_name: string): Promise<ResolvedStream | null> {
    try {
      const res = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
          Referer: 'https://jkanime.net/',
        },
      });

      const html = res.data;
      if (typeof html !== 'string' || html.includes('404') || html.includes('Not Found')) {
        return null;
      }

      const match_video = html.match(/(https?:\/\/[^"'\s,]+\.(?:mp4|m3u8)[^"'\s,]*)/i);
      if (match_video && match_video[1]) {
        const stream_url = match_video[1];
        return {
          server_name,
          stream_url,
          is_hls: stream_url.includes('.m3u8'),
          headers: { Referer: url },
          original_embed_url: url,
        };
      }

      return {
        server_name,
        stream_url: url,
        is_hls: false,
        headers: { Referer: 'https://jkanime.net/' },
        original_embed_url: url,
      };
    } catch {
      return null;
    }
  }

  private async extractMediafire(url: string, server_name: string): Promise<ResolvedStream | null> {
    try {
      const res = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
          Referer: 'https://jkanime.net/',
        },
      });

      const $ = cheerio.load(res.data);
      const download_button = $('#downloadButton, a[aria-label="Download file"]');
      const direct_url = download_button.attr('href');

      if (direct_url && direct_url.startsWith('http')) {
        return {
          server_name,
          stream_url: direct_url,
          is_hls: false,
          original_embed_url: url,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  private async extractMp4upload(url: string, server_name: string): Promise<ResolvedStream | null> {
    try {
      const res = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
          Referer: 'https://jkanime.net/',
        },
      });

      const html = res.data;
      if (html.includes('File was deleted') || html.includes('File Not Found') || html.length < 500) {
        return null;
      }

      const match_src =
        html.match(/player\.src\(["']([^"']+\.mp4[^"']*)["']\)/i) || html.match(/src:\s*["']([^"']+\.mp4[^"']*)["']/i);

      if (match_src && match_src[1]) {
        return {
          server_name,
          stream_url: match_src[1],
          is_hls: false,
          headers: { Referer: url },
          original_embed_url: url,
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  private async extractMixdrop(url: string, server_name: string): Promise<ResolvedStream | null> {
    try {
      const embed_url = url.replace('/f/', '/e/');
      const res = await axios.get(embed_url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
          Referer: 'https://jkanime.net/',
        },
        validateStatus: () => true,
      });

      const html = typeof res.data === 'string' ? res.data : '';
      if (res.status >= 400 || html.includes('File not found') || html.includes('Deleted') || html.length < 500) {
        return null;
      }

      return {
        server_name,
        stream_url: embed_url,
        is_hls: false,
        headers: { Referer: 'https://jkanime.net/' },
        original_embed_url: embed_url,
      };
    } catch {
      return null;
    }
  }

  private async extractVidhide(url: string, server_name: string): Promise<ResolvedStream | null> {
    try {
      const res = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
          Referer: 'https://jkanime.net/',
        },
        validateStatus: () => true,
      });

      const html = typeof res.data === 'string' ? res.data : '';
      if (res.status >= 400 || html.includes('File was deleted') || html.includes('File Not Found') || html.length < 500) {
        return null;
      }

      return {
        server_name,
        stream_url: url,
        is_hls: false,
        headers: { Referer: 'https://jkanime.net/' },
        original_embed_url: url,
      };
    } catch {
      return null;
    }
  }

  private async extractFilemoon(url: string, server_name: string): Promise<ResolvedStream | null> {
    try {
      const res = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
          Referer: 'https://jkanime.net/',
        },
        validateStatus: () => true,
      });

      const html = typeof res.data === 'string' ? res.data : '';
      if (res.status >= 400 || html.includes('File was deleted') || html.includes('File Not Found') || html.length < 500) {
        return null;
      }

      return {
        server_name,
        stream_url: url,
        is_hls: false,
        headers: { Referer: 'https://jkanime.net/' },
        original_embed_url: url,
      };
    } catch {
      return null;
    }
  }

  private async extractVoe(url: string, server_name: string): Promise<ResolvedStream | null> {
    try {
      const res = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
          Referer: 'https://jkanime.net/',
        },
        validateStatus: () => true,
      });

      const html = typeof res.data === 'string' ? res.data : '';
      if (res.status >= 400 || html.includes('Video not found') || html.includes('404 Not Found') || html.length < 300) {
        return null;
      }

      return {
        server_name,
        stream_url: url,
        is_hls: false,
        headers: { Referer: 'https://jkanime.net/' },
        original_embed_url: url,
      };
    } catch {
      return null;
    }
  }

  private async extractStreamtape(url: string, server_name: string): Promise<ResolvedStream | null> {
    try {
      const res = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
          Referer: 'https://jkanime.net/',
        },
        validateStatus: () => true,
      });

      const html = typeof res.data === 'string' ? res.data : '';
      if (res.status >= 400 || html.includes('File Not Found') || html.includes('Video not found') || html.length < 500) {
        return null;
      }

      return {
        server_name,
        stream_url: url,
        is_hls: false,
        headers: { Referer: 'https://jkanime.net/' },
        original_embed_url: url,
      };
    } catch {
      return null;
    }
  }

  /**
   * Health Check Fino Anti-Falsos Positivos: Valida que la URL o embed responda exitosamente y no esté caída o eliminada.
   */
  public async verifyStreamAvailability(stream: ResolvedStream): Promise<boolean> {
    try {
      // 1. Flujo HLS (.m3u8): verificar que el manifiesto responda 200 y contenga #EXT
      if (stream.is_hls || stream.stream_url.includes('.m3u8')) {
        const res = await axios.get(stream.stream_url, {
          timeout: 7000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
            ...(stream.headers || {}),
          },
          maxRedirects: 5,
          validateStatus: (status) => status >= 200 && status < 400,
        });

        const is_valid = typeof res.data === 'string' && res.data.includes('#EXT');
        return is_valid;
      }

      // 2. Video directo MP4
      if (stream.stream_url.includes('.mp4') && stream.stream_url !== stream.original_embed_url) {
        const res = await axios.get(stream.stream_url, {
          timeout: 7000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
            ...(stream.headers || {}),
            Range: 'bytes=0-100',
          },
          maxRedirects: 5,
          validateStatus: (status) => status >= 200 && status < 400,
        });

        return res.status === 200 || res.status === 206;
      }

      // 3. Iframe Embed (Mixdrop, Vidhide, Filemoon, VOE, Streamtape)
      const res = await axios.get(stream.original_embed_url, {
        timeout: 7000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
          Referer: 'https://jkanime.net/',
        },
        maxRedirects: 5,
        validateStatus: () => true,
      });

      if (res.status >= 400) {
        return false;
      }

      const body_str = typeof res.data === 'string' ? res.data : '';
      if (body_str.length < 300) {
        return false;
      }

      const lower = body_str.toLowerCase();
      const is_dead =
        lower.includes('file was deleted') ||
        lower.includes('file not found') ||
        lower.includes('video not found') ||
        lower.includes('has been removed') ||
        lower.includes('video has been deleted') ||
        lower.includes('no longer exists');

      if (is_dead) return false;

      // Validación por servidor de contenido esperado
      const s_name = stream.server_name.toLowerCase();
      if (s_name.includes('mixdrop')) {
        return body_str.includes('MDCore');
      }
      if (s_name.includes('vidhide')) {
        return body_str.includes('jwplayer') || body_str.includes('vplayer');
      }
      if (s_name.includes('streamtape')) {
        return body_str.includes('botlink') || body_str.includes('videolink');
      }
      if (s_name.includes('filemoon')) {
        return body_str.includes('video-embed-mode') || body_str.includes('root') || body_str.includes('filemoon');
      }

      return true;
    } catch (err: any) {
      logger.warn({ err: err.message, stream_url: stream.stream_url }, 'Health check de stream/servidor fallido');
      return false;
    }
  }

  public unpackJs(packed_code: string): string {
    try {
      const args_match = packed_code.match(/}\('(.+)',(\d+),(\d+),'([^']+)'\.split\('\|'\)/);
      if (!args_match || !args_match[1] || !args_match[2] || !args_match[3] || !args_match[4]) {
        return packed_code;
      }

      let payload = args_match[1];
      const radix = parseInt(args_match[2], 10);
      const count = parseInt(args_match[3], 10);
      const dictionary = args_match[4].split('|');

      const encode = (val: number): string => {
        const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        return (val >= radix ? encode(Math.floor(val / radix)) : '') + chars[val % radix];
      };

      for (let i = count - 1; i >= 0; i--) {
        const key = encode(i);
        const replacement = dictionary[i] || key;
        const reg = new RegExp(`\\b${key}\\b`, 'g');
        payload = payload.replace(reg, replacement);
      }

      return payload;
    } catch {
      return packed_code;
    }
  }
}

export const streamExtractor = new StreamExtractor();
export default streamExtractor;
