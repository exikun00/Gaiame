import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const TARGET_URLS = [
  'https://jkanime.net/kanojo-ga-flag-wo-oraretara/3/',
  'https://jkanime.net/kyoufu-collector/1/',
  'https://jkanime.net/angel-beats-ova/1/',
  'https://jkanime.net/rezero-kara-hajimeru-isekai-seikatsu-4th-season/16/',
];

const ALLOWED_SERVERS = [
  'desu',
  'magi',
  'mediafire',
  'mp4upload',
  'mixdrop',
  'vidhide',
  'filemoon',
  'voe',
  'streamtape',
];

export interface ServerAnalysis {
  server: string;
  source_type: 'player_embed' | 'download_mirror';
  raw_url: string;
  embed_url: string;
  is_alive: boolean;
  error_reason?: string;
  direct_stream_url?: string;
  stream_type?: 'HLS' | 'MP4' | 'EMBED_ONLY';
  downloadable_playable?: boolean;
  codec?: string;
  resolution?: string;
}

// Comprueba la salud del embed y extrae la fuente real si existe
async function inspectServer(server_name: string, raw_url: string, source_type: 'player_embed' | 'download_mirror'): Promise<ServerAnalysis> {
  const norm = server_name.toLowerCase();
  
  // 1. DESU
  if (norm.includes('desu') && !norm.includes('desuka')) {
    try {
      const res = await axios.get(raw_url, {
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://jkanime.net/' },
        timeout: 10000,
        validateStatus: () => true
      });
      if (res.status >= 400 || !res.data || res.data.includes('404')) {
        return { server: server_name, source_type, raw_url, embed_url: raw_url, is_alive: false, error_reason: `HTTP ${res.status} o 404` };
      }
      const match = res.data.match(/(https?:\/\/[^"'\s,]+\.(?:mp4|m3u8)[^"'\s,]*)/i);
      const stream_url = match ? match[1] : undefined;
      return {
        server: server_name,
        source_type,
        raw_url,
        embed_url: raw_url,
        is_alive: !!stream_url,
        direct_stream_url: stream_url,
        stream_type: stream_url?.includes('.m3u8') ? 'HLS' : 'MP4'
      };
    } catch (e: any) {
      return { server: server_name, source_type, raw_url, embed_url: raw_url, is_alive: false, error_reason: e.message };
    }
  }

  // 2. MAGI
  if (norm.includes('magi')) {
    try {
      const res = await axios.get(raw_url, {
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://jkanime.net/' },
        timeout: 10000,
        validateStatus: () => true
      });
      if (res.status >= 400 || !res.data || res.data.includes('404')) {
        return { server: server_name, source_type, raw_url, embed_url: raw_url, is_alive: false, error_reason: `HTTP ${res.status}` };
      }
      const match = res.data.match(/(https?:\/\/[^"'\s,]+\.(?:mp4|m3u8)[^"'\s,]*)/i);
      const stream_url = match ? match[1] : undefined;
      return {
        server: server_name,
        source_type,
        raw_url,
        embed_url: raw_url,
        is_alive: !!stream_url,
        direct_stream_url: stream_url,
        stream_type: stream_url?.includes('.m3u8') ? 'HLS' : 'MP4'
      };
    } catch (e: any) {
      return { server: server_name, source_type, raw_url, embed_url: raw_url, is_alive: false, error_reason: e.message };
    }
  }

  // 3. MEDIAFIRE
  if (norm.includes('mediafire')) {
    try {
      const res = await axios.get(raw_url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 10000,
        validateStatus: () => true
      });
      if (res.status >= 400) {
        return { server: server_name, source_type, raw_url, embed_url: raw_url, is_alive: false, error_reason: `HTTP ${res.status}` };
      }
      const $ = cheerio.load(res.data);
      const direct = $('#downloadButton, a[aria-label="Download file"]').attr('href');
      if (direct && direct.startsWith('http')) {
        return {
          server: server_name,
          source_type,
          raw_url,
          embed_url: raw_url,
          is_alive: true,
          direct_stream_url: direct,
          stream_type: 'MP4'
        };
      }
      return { server: server_name, source_type, raw_url, embed_url: raw_url, is_alive: false, error_reason: 'Botón de descarga no encontrado o archivo borrado' };
    } catch (e: any) {
      return { server: server_name, source_type, raw_url, embed_url: raw_url, is_alive: false, error_reason: e.message };
    }
  }

  // 4. MP4UPLOAD
  if (norm.includes('mp4upload')) {
    try {
      const res = await axios.get(raw_url, {
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://jkanime.net/' },
        timeout: 10000,
        validateStatus: () => true
      });
      if (res.status >= 400 || res.data.includes('File was deleted') || res.data.length < 500) {
        return { server: server_name, source_type, raw_url, embed_url: raw_url, is_alive: false, error_reason: 'Archivo eliminado (File was deleted)' };
      }
      const m = res.data.match(/player\.src\(["']([^"']+\.mp4[^"']*)["']\)/i) || res.data.match(/src:\s*["']([^"']+\.mp4[^"']*)["']/i);
      const direct = m ? m[1] : undefined;
      return {
        server: server_name,
        source_type,
        raw_url,
        embed_url: raw_url,
        is_alive: true,
        direct_stream_url: direct,
        stream_type: direct ? 'MP4' : 'EMBED_ONLY'
      };
    } catch (e: any) {
      return { server: server_name, source_type, raw_url, embed_url: raw_url, is_alive: false, error_reason: e.message };
    }
  }

  // 5. MIXDROP
  if (norm.includes('mixdrop')) {
    try {
      const embed_url = raw_url.replace('/f/', '/e/');
      const res = await axios.get(embed_url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0', Referer: 'https://jkanime.net/' },
        timeout: 10000,
        validateStatus: () => true
      });
      const html = res.data || '';
      if (res.status >= 400 || html.includes('File not found') || html.includes('Deleted') || html.length < 500) {
        return { server: server_name, source_type, raw_url, embed_url, is_alive: false, error_reason: 'Mixdrop: Archivo no encontrado o eliminado' };
      }
      // Mixdrop contiene MDCore
      const has_mdcore = html.includes('MDCore');
      return {
        server: server_name,
        source_type,
        raw_url,
        embed_url,
        is_alive: has_mdcore,
        stream_type: 'EMBED_ONLY'
      };
    } catch (e: any) {
      return { server: server_name, source_type, raw_url, embed_url: raw_url, is_alive: false, error_reason: e.message };
    }
  }

  // 6. VIDHIDE
  if (norm.includes('vidhide')) {
    try {
      const res = await axios.get(raw_url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0', Referer: 'https://jkanime.net/' },
        timeout: 10000,
        validateStatus: () => true
      });
      const html = res.data || '';
      if (res.status >= 400 || html.includes('File was deleted') || html.includes('File Not Found') || html.length < 500) {
        return { server: server_name, source_type, raw_url, embed_url: raw_url, is_alive: false, error_reason: 'Vidhide: Archivo eliminado' };
      }
      return {
        server: server_name,
        source_type,
        raw_url,
        embed_url: raw_url,
        is_alive: html.includes('jwplayer') || html.includes('vplayer'),
        stream_type: 'EMBED_ONLY'
      };
    } catch (e: any) {
      return { server: server_name, source_type, raw_url, embed_url: raw_url, is_alive: false, error_reason: e.message };
    }
  }

  // 7. FILEMOON
  if (norm.includes('filemoon')) {
    try {
      const res = await axios.get(raw_url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0', Referer: 'https://jkanime.net/' },
        timeout: 10000,
        validateStatus: () => true
      });
      const html = res.data || '';
      if (res.status >= 400 || html.includes('File was deleted') || html.includes('File Not Found') || html.length < 500) {
        return { server: server_name, source_type, raw_url, embed_url: raw_url, is_alive: false, error_reason: 'Filemoon: Archivo eliminado' };
      }
      return {
        server: server_name,
        source_type,
        raw_url,
        embed_url: raw_url,
        is_alive: html.includes('video-embed-mode') || html.includes('root') || html.includes('filemoon'),
        stream_type: 'EMBED_ONLY'
      };
    } catch (e: any) {
      return { server: server_name, source_type, raw_url, embed_url: raw_url, is_alive: false, error_reason: e.message };
    }
  }

  // 8. VOE
  if (norm.includes('voe')) {
    try {
      const res = await axios.get(raw_url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0', Referer: 'https://jkanime.net/' },
        timeout: 10000,
        validateStatus: () => true
      });
      const html = res.data || '';
      if (res.status >= 400 || html.includes('Video not found') || html.includes('404 Not Found') || html.length < 300) {
        return { server: server_name, source_type, raw_url, embed_url: raw_url, is_alive: false, error_reason: 'VOE: Video not found' };
      }
      return {
        server: server_name,
        source_type,
        raw_url,
        embed_url: raw_url,
        is_alive: html.includes('Redirecting') || html.includes('window.location.href'),
        stream_type: 'EMBED_ONLY'
      };
    } catch (e: any) {
      return { server: server_name, source_type, raw_url, embed_url: raw_url, is_alive: false, error_reason: e.message };
    }
  }

  // 9. STREAMTAPE
  if (norm.includes('streamtape')) {
    try {
      const res = await axios.get(raw_url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0', Referer: 'https://jkanime.net/' },
        timeout: 10000,
        validateStatus: () => true
      });
      const html = res.data || '';
      if (res.status >= 400 || html.includes('File Not Found') || html.includes('Video not found') || html.length < 500) {
        return { server: server_name, source_type, raw_url, embed_url: raw_url, is_alive: false, error_reason: `Streamtape: HTTP ${res.status} o Not Found` };
      }
      return {
        server: server_name,
        source_type,
        raw_url,
        embed_url: raw_url,
        is_alive: html.includes('botlink') || html.includes('robotlink'),
        stream_type: 'EMBED_ONLY'
      };
    } catch (e: any) {
      return { server: server_name, source_type, raw_url, embed_url: raw_url, is_alive: false, error_reason: e.message };
    }
  }

  return { server: server_name, source_type, raw_url, embed_url: raw_url, is_alive: false, error_reason: 'Servidor no permitido' };
}

async function testAll() {
  console.log('========================================================================');
  console.log(' EVALUACIÓN DE SERVIDORES RETENIDOS Y DETECCIÓN PRECISA DE ERRORES ');
  console.log('========================================================================\n');

  for (const url of TARGET_URLS) {
    console.log(`\n📌 Analizando: ${url}`);
    const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = res.data;
    const $ = cheerio.load(html);

    const candidates: { server: string; raw_url: string; source_type: 'player_embed' | 'download_mirror' }[] = [];

    // Player tabs
    const video_array: Record<number, string> = {};
    const matches = html.matchAll(/video\[(\d+)\]\s*=\s*['"]<iframe[^>]*src=['"]([^'"]+)['"]/gi);
    for (const m of matches) {
      if (m[1] && m[2]) video_array[parseInt(m[1], 10)] = m[2];
    }
    $('.bg-servers a').each((i, el) => {
      const name = $(el).text().trim();
      const id = parseInt($(el).attr('data-id') || `${i}`, 10);
      const embed = video_array[id] || video_array[i];
      if (embed) candidates.push({ server: name, raw_url: embed, source_type: 'player_embed' });
    });

    // Var servers
    const match_servers = html.match(/var\s+servers\s*=\s*(\[\s*\{.*?\}\s*\]);/s);
    if (match_servers && match_servers[1]) {
      const raw_servers = JSON.parse(match_servers[1]);
      for (const s of raw_servers) {
        let decoded = '';
        try { decoded = Buffer.from(s.remote, 'base64').toString('utf-8'); } catch { decoded = s.remote; }
        candidates.push({ server: s.server, raw_url: decoded, source_type: 'download_mirror' });
      }
    }

    // Filtrar SOLO los servidores solicitados por el usuario
    const filtered = candidates.filter((c) => {
      const norm = c.server.toLowerCase();
      if (norm.includes('desuka')) return false;
      return ALLOWED_SERVERS.some((a) => norm.includes(a));
    });

    console.log(`Encontrados ${filtered.length} servidores permitidos de ${candidates.length} totales:\n`);

    for (const c of filtered) {
      const result = await inspectServer(c.server, c.raw_url, c.source_type);
      const icon = result.is_alive ? '✔ [VIVO]' : '✘ [MUERTO/ERROR]';
      console.log(`  ${icon} ${result.server.padEnd(12)} (${result.source_type}) -> Embed: ${result.embed_url.substring(0, 50)}... | Tipo: ${result.stream_type || 'N/A'}`);
      if (!result.is_alive) {
        console.log(`      Motivo de Descarte: ${result.error_reason}`);
      } else if (result.direct_stream_url) {
        console.log(`      Direct Video Stream: ${result.direct_stream_url.substring(0, 60)}...`);
      }
    }
  }
}

testAll().catch(console.error);
