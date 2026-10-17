import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import axios from 'axios';
import * as cheerio from 'cheerio';
import jkanimeScraper, { ScrapedServer } from '../services/scraper.js';
import streamExtractor, { ResolvedStream } from '../services/extractor.js';

const execFileAsync = promisify(execFile);

const TARGET_URLS = [
  'https://jkanime.net/kanojo-ga-flag-wo-oraretara/3/',
  'https://jkanime.net/kyoufu-collector/1/',
  'https://jkanime.net/angel-beats-ova/1/',
  'https://jkanime.net/rezero-kara-hajimeru-isekai-seikatsu-4th-season/16/',
];

const TEN_MB = 10 * 1024 * 1024; // 10,485,760 bytes
const SCRATCH_DIR = '/home/exilost/.gemini/antigravity-cli/brain/257d044f-693c-4b95-a186-37cac660f454/scratch';
const RESULTS_JSON_PATH = path.join(SCRATCH_DIR, 'server_test_results.json');

export interface ServerTestResult {
  anime_slug: string;
  episode: number;
  server_name: string;
  source_type: 'player_embed' | 'download_mirror';
  raw_url: string;
  extracted_url: string | null;
  is_hls: boolean;
  http_status: number | null;
  content_type: string | null;
  bytes_downloaded: number;
  hit_10mb_limit: boolean;
  probe_status: 'VALID_VIDEO' | 'INVALID_VIDEO' | 'PROBE_FAILED' | 'SKIPPED';
  video_codec?: string;
  resolution?: string;
  verdict: 'SUCCESS_PLAYABLE_VIDEO' | 'FAKE_200_HTML' | 'FAKE_200_DELETED' | 'HTTP_ERROR' | 'CORRUPTED_OR_GARBAGE' | 'EXTRACTION_FAILED';
  analysis: string;
  sample_header_snippet?: string;
}

/**
 * Extrae TODOS los servidores (tanto reproductores como mirrors) de la página de un episodio
 */
async function scrapeAllServers(url: string): Promise<{ slug: string; episode: number; servers: (ScrapedServer & { source_type: 'player_embed' | 'download_mirror' })[] }> {
  const parts = url.replace('https://jkanime.net/', '').replace(/\/$/, '').split('/');
  const slug = parts[0] || '';
  const episode = parseInt(parts[1] || '1', 10);

  const res = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    timeout: 15000,
  });

  const html = res.data;
  const $ = cheerio.load(html);
  const servers: (ScrapedServer & { source_type: 'player_embed' | 'download_mirror' })[] = [];

  // 1. Extraer reproductores embebidos (.bg-servers a)
  const player_tabs: { name: string; data_id: number }[] = [];
  $('.bg-servers a').each((i, el) => {
    const name = $(el).text().trim();
    const data_id = parseInt($(el).attr('data-id') || `${i}`, 10);
    if (name) {
      player_tabs.push({ name, data_id });
    }
  });

  const video_array: Record<number, string> = {};
  const video_matches = html.matchAll(/video\[(\d+)\]\s*=\s*['"]<iframe[^>]*src=['"]([^'"]+)['"]/gi);
  for (const m of video_matches) {
    if (m[1] && m[2]) {
      video_array[parseInt(m[1], 10)] = m[2];
    }
  }

  player_tabs.forEach((tab, index) => {
    const embed_url = video_array[tab.data_id] ?? video_array[index];
    if (embed_url) {
      const full_url = embed_url.startsWith('//')
        ? `https:${embed_url}`
        : embed_url.startsWith('/')
        ? `https://jkanime.net${embed_url}`
        : embed_url;

      servers.push({
        server: tab.name,
        raw_url: full_url,
        slug: `${slug}-${episode}-${tab.name.toLowerCase()}`,
        source_type: 'player_embed',
      });
    }
  });

  // 2. Extraer mirrors de descarga (var servers = [...])
  const match_servers = html.match(/var\s+servers\s*=\s*(\[\s*\{.*?\}\s*\]);/s);
  if (match_servers && match_servers[1]) {
    try {
      const raw_servers = JSON.parse(match_servers[1]);
      for (const item of raw_servers) {
        if (!item.remote || !item.server) continue;
        let decoded_url = '';
        try {
          decoded_url = Buffer.from(item.remote, 'base64').toString('utf-8').trim();
        } catch {
          decoded_url = item.remote;
        }

        servers.push({
          server: item.server,
          raw_url: decoded_url,
          slug: item.slug || '',
          size: item.size,
          source_type: 'download_mirror',
        });
      }
    } catch (e: any) {
      console.warn('Error parsing var servers JSON:', e.message);
    }
  }

  return { slug, episode, servers };
}

/**
 * Descarga hasta 10 MB usando axios con streaming o ffmpeg para HLS
 */
async function testDownload10Mb(
  stream: ResolvedStream,
  target_file: string
): Promise<{ bytes_downloaded: number; hit_10mb_limit: boolean; http_status: number | null; content_type: string | null; error?: string }> {
  // Asegurar que el archivo no exista previamente
  if (fs.existsSync(target_file)) {
    fs.unlinkSync(target_file);
  }

  const is_hls = stream.is_hls || stream.stream_url.includes('.m3u8');

  if (is_hls) {
    // Para HLS, verificar primero respuesta HTTP del playlist m3u8
    let http_status: number | null = null;
    let content_type: string | null = null;
    try {
      const head_res = await axios.get(stream.stream_url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
          ...(stream.headers || {}),
        },
        validateStatus: () => true,
      });
      http_status = head_res.status;
      content_type = head_res.headers['content-type'] || null;

      if (http_status >= 400 || !String(head_res.data).includes('#EXT')) {
        return {
          bytes_downloaded: 0,
          hit_10mb_limit: false,
          http_status,
          content_type,
          error: `M3U8 playlist invalid or returned HTTP ${http_status}`,
        };
      }
    } catch (err: any) {
      return {
        bytes_downloaded: 0,
        hit_10mb_limit: false,
        http_status: err.response?.status || null,
        content_type: err.response?.headers?.['content-type'] || null,
        error: `Error connecting to M3U8: ${err.message}`,
      };
    }

    // Descargar segmentos con ffmpeg con límite de tamaño -fs 10M
    try {
      const headers_arg = stream.headers?.Referer ? `Referer: ${stream.headers.Referer}\r\n` : '';
      const ffmpeg_args = [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        ...(headers_arg ? ['-headers', headers_arg] : []),
        '-i',
        stream.stream_url,
        '-c',
        'copy',
        '-fs',
        '10485760', // 10MB
        '-t',
        '35', // Máximo 35 segundos de video
        '-f',
        'mp4',
        target_file,
      ];

      await execFileAsync('/usr/bin/ffmpeg', ffmpeg_args, { timeout: 35000 });
      const stats = fs.existsSync(target_file) ? fs.statSync(target_file) : { size: 0 };
      const hit_10mb = stats.size >= 9.5 * 1024 * 1024; // cercano a 10MB
      return {
        bytes_downloaded: stats.size,
        hit_10mb_limit: hit_10mb,
        http_status: 200,
        content_type: 'application/vnd.apple.mpegurl',
      };
    } catch (err: any) {
      const stats = fs.existsSync(target_file) ? fs.statSync(target_file) : { size: 0 };
      if (stats.size > 1024 * 500) {
        // Logró descargar una porción significativa
        return {
          bytes_downloaded: stats.size,
          hit_10mb_limit: stats.size >= 9.5 * 1024 * 1024,
          http_status: 200,
          content_type: 'application/vnd.apple.mpegurl',
        };
      }
      return {
        bytes_downloaded: stats.size,
        hit_10mb_limit: false,
        http_status: 200,
        content_type: 'application/vnd.apple.mpegurl',
        error: `ffmpeg failed: ${err.message}`,
      };
    }
  }

  // Descarga directa HTTP (MP4, MKV, o endpoint)
  const abort_controller = new AbortController();
  const file_stream = fs.createWriteStream(target_file);
  let bytes_downloaded = 0;
  let hit_10mb_limit = false;
  let http_status: number | null = null;
  let content_type: string | null = null;

  try {
    const response = await axios.get(stream.stream_url, {
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        ...(stream.headers || {}),
      },
      signal: abort_controller.signal,
      timeout: 15000,
      validateStatus: () => true,
    });

    http_status = response.status;
    content_type = response.headers['content-type'] || null;

    if (http_status >= 400) {
      file_stream.close();
      return {
        bytes_downloaded: 0,
        hit_10mb_limit: false,
        http_status,
        content_type,
        error: `HTTP error status ${http_status}`,
      };
    }

    await new Promise<void>((resolve, reject) => {
      response.data.on('data', (chunk: Buffer) => {
        bytes_downloaded += chunk.length;
        file_stream.write(chunk);

        if (bytes_downloaded >= TEN_MB) {
          hit_10mb_limit = true;
          abort_controller.abort();
          file_stream.end(() => resolve());
        }
      });

      response.data.on('end', () => {
        file_stream.end(() => resolve());
      });

      response.data.on('error', (err: any) => {
        if (abort_controller.signal.aborted) {
          file_stream.end(() => resolve());
        } else {
          file_stream.end(() => reject(err));
        }
      });
    });

    return {
      bytes_downloaded,
      hit_10mb_limit,
      http_status,
      content_type,
    };
  } catch (err: any) {
    file_stream.close();
    if (abort_controller.signal.aborted) {
      return {
        bytes_downloaded,
        hit_10mb_limit: true,
        http_status,
        content_type,
      };
    }
    return {
      bytes_downloaded,
      hit_10mb_limit: false,
      http_status: http_status || err.response?.status || null,
      content_type: content_type || err.response?.headers?.['content-type'] || null,
      error: err.message,
    };
  }
}

/**
 * Valida si un archivo parcial descargado es un video real y reproducible usando ffprobe
 */
async function probeVideoFile(filepath: string): Promise<{
  valid: boolean;
  codec?: string;
  resolution?: string;
  error?: string;
}> {
  if (!fs.existsSync(filepath)) {
    return { valid: false, error: 'File does not exist' };
  }

  const stat = fs.statSync(filepath);
  if (stat.size < 512) {
    return { valid: false, error: `File too small (${stat.size} bytes)` };
  }

  try {
    const { stdout } = await execFileAsync('/usr/bin/ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=codec_name,width,height',
      '-of',
      'json',
      filepath,
    ]);

    const info = JSON.parse(stdout);
    const video_stream = info.streams?.[0];

    if (video_stream && video_stream.codec_name) {
      return {
        valid: true,
        codec: video_stream.codec_name,
        resolution: `${video_stream.width || '?'}x${video_stream.height || '?'}`,
      };
    }

    return { valid: false, error: 'ffprobe found no video stream' };
  } catch (err: any) {
    return { valid: false, error: `ffprobe failed: ${err.message}` };
  }
}

/**
 * Ejecuta el test completo para todas las URLs y servidores
 */
async function runTests() {
  console.log('========================================================================');
  console.log(' INICIANDO DIAGNÓSTICO PROFUNDO DE SERVIDORES Y DESCARGAS (10 MB TEST) ');
  console.log('========================================================================\n');

  const all_results: ServerTestResult[] = [];

  for (const url of TARGET_URLS) {
    console.log(`\n🔍 Scrapeando página objetivo: ${url}`);
    const { slug, episode, servers } = await scrapeAllServers(url);
    console.log(`📌 Encontrados ${servers.length} servidores candidatos para ${slug} Ep ${episode}:\n`);

    for (let i = 0; i < servers.length; i++) {
      const candidate = servers[i]!;
      console.log(`------------------------------------------------------------------------`);
      console.log(`[${i + 1}/${servers.length}] Probando Servidor: "${candidate.server}" (${candidate.source_type})`);
      console.log(`    URL Original: ${candidate.raw_url}`);

      let stream: ResolvedStream | null = null;
      try {
        stream = await streamExtractor.extractStreamFromCandidate(candidate);
      } catch (err: any) {
        console.log(`    ✘ Error durante la extracción: ${err.message}`);
      }

      if (!stream) {
        console.log(`    ✘ Extracción fallida (retornó null)`);
        all_results.push({
          anime_slug: slug,
          episode,
          server_name: candidate.server,
          source_type: candidate.source_type,
          raw_url: candidate.raw_url,
          extracted_url: null,
          is_hls: false,
          http_status: null,
          content_type: null,
          bytes_downloaded: 0,
          hit_10mb_limit: false,
          probe_status: 'SKIPPED',
          verdict: 'EXTRACTION_FAILED',
          analysis: 'El extractor no soporta el host o el servidor está marcado como caído (ej. Desuka)',
        });
        continue;
      }

      console.log(`    URL Extraída: ${stream.stream_url}`);
      console.log(`    Tipo HLS: ${stream.is_hls}`);

      // Intentar descarga de 10 MB a un archivo temporal
      const test_part_path = path.join(
        SCRATCH_DIR,
        `test_${slug}_ep${episode}_${candidate.server.toLowerCase().replace(/[^a-z0-9]/g, '_')}.part`
      );

      console.log(`    ⏳ Intentando descargar hasta 10 MB...`);
      const dl_result = await testDownload10Mb(stream, test_part_path);

      console.log(`    HTTP Status: ${dl_result.http_status ?? 'N/A'}`);
      console.log(`    Content-Type: ${dl_result.content_type ?? 'N/A'}`);
      console.log(`    Bytes Descargados: ${(dl_result.bytes_downloaded / (1024 * 1024)).toFixed(2)} MB (${dl_result.bytes_downloaded} bytes)`);
      console.log(`    Alcanzó límite 10 MB: ${dl_result.hit_10mb_limit ? 'SÍ (Cancelado exitosamente a 10MB)' : 'NO'}`);

      // Analizar cabecera del archivo (primeros 1024 bytes) si existe
      let snippet = '';
      if (fs.existsSync(test_part_path) && dl_result.bytes_downloaded > 0) {
        try {
          const buf = fs.readFileSync(test_part_path);
          snippet = buf.subarray(0, 1024).toString('utf-8');
        } catch {}
      }

      // Probar si el archivo es un video válido con ffprobe
      let probe_result = { valid: false, codec: undefined as string | undefined, resolution: undefined as string | undefined, error: undefined as string | undefined };
      if (fs.existsSync(test_part_path) && dl_result.bytes_downloaded > 1024 * 100) {
        probe_result = await probeVideoFile(test_part_path);
      }

      // Clasificación rigurosa
      let verdict: ServerTestResult['verdict'] = 'CORRUPTED_OR_GARBAGE';
      let analysis = '';

      const snippet_lower = snippet.toLowerCase();
      const is_html = snippet_lower.includes('<!doctype html') || snippet_lower.includes('<html') || snippet_lower.includes('<head') || snippet_lower.includes('<script');
      const is_deleted = snippet_lower.includes('file was deleted') || snippet_lower.includes('file not found') || snippet_lower.includes('video not found') || snippet_lower.includes('no longer exists');

      if (probe_result.valid) {
        verdict = 'SUCCESS_PLAYABLE_VIDEO';
        analysis = `Video real válido comprobado con ffprobe (Codec: ${probe_result.codec}, Resolución: ${probe_result.resolution}). Descargó ${(dl_result.bytes_downloaded / (1024 * 1024)).toFixed(2)} MB.`;
        console.log(`    ✔ [EXITOSO - VIDEO REAL]: Codec ${probe_result.codec}, Res ${probe_result.resolution}`);
      } else if (dl_result.http_status && dl_result.http_status >= 400) {
        verdict = 'HTTP_ERROR';
        analysis = `Error HTTP ${dl_result.http_status}. El servidor o CDN devolvió un código de error.`;
        console.log(`    ✘ [ERROR HTTP]: Status ${dl_result.http_status}`);
      } else if (is_deleted) {
        verdict = 'FAKE_200_DELETED';
        analysis = 'Falso 200: El servidor responde OK pero el contenido es un aviso de archivo borrado/eliminado.';
        console.log(`    ✘ [FALSO 200 - ARCHIVO ELIMINADO]: El contenido dice 'File was deleted'`);
      } else if (is_html || (dl_result.content_type && dl_result.content_type.includes('text/html'))) {
        verdict = 'FAKE_200_HTML';
        analysis = `Falso 200: Se descargó una página HTML en vez de un flujo de video binario (${dl_result.content_type || 'HTML body'}). Esto ocurre cuando se pasa la URL del embed o reproductor directamente al downloader.`;
        console.log(`    ✘ [FALSO 200 - ES HTML]: Se intentó descargar la página web del reproductor iframe.`);
      } else if (dl_result.bytes_downloaded === 0) {
        verdict = 'HTTP_ERROR';
        analysis = `0 bytes descargados. Falló conexión o el stream no emite datos (${dl_result.error || 'Timeout/Socket error'}).`;
        console.log(`    ✘ [ERROR 0 BYTES]: No se recibieron datos.`);
      } else {
        verdict = 'CORRUPTED_OR_GARBAGE';
        analysis = `Datos basura o contenedor inválido: descargó ${(dl_result.bytes_downloaded / 1024).toFixed(1)} KB pero ffprobe no pudo detectar ningún stream de video válido (${probe_result.error || 'desconocido'}).`;
        console.log(`    ✘ [DATOS BASURA/CORRUPTO]: ffprobe no pudo parsear video válido.`);
      }

      all_results.push({
        anime_slug: slug,
        episode,
        server_name: candidate.server,
        source_type: candidate.source_type,
        raw_url: candidate.raw_url,
        extracted_url: stream.stream_url,
        is_hls: stream.is_hls,
        http_status: dl_result.http_status,
        content_type: dl_result.content_type,
        bytes_downloaded: dl_result.bytes_downloaded,
        hit_10mb_limit: dl_result.hit_10mb_limit,
        probe_status: probe_result.valid ? 'VALID_VIDEO' : dl_result.bytes_downloaded > 100000 ? 'INVALID_VIDEO' : 'PROBE_FAILED',
        video_codec: probe_result.codec,
        resolution: probe_result.resolution,
        verdict,
        analysis,
        sample_header_snippet: snippet.slice(0, 200).replace(/\s+/g, ' ').trim(),
      });

      // Limpiar archivo temporal de prueba para no ocupar disco
      if (fs.existsSync(test_part_path)) {
        fs.unlinkSync(test_part_path);
      }
    }
  }

  // Guardar resultados en JSON estructurado
  fs.writeFileSync(RESULTS_JSON_PATH, JSON.stringify(all_results, null, 2), 'utf-8');
  console.log(`\n✔ Resultados guardados en ${RESULTS_JSON_PATH}`);

  // Mostrar Resumen Tabular
  console.log('\n========================================================================');
  console.log('                          RESUMEN DE RESULTADOS                         ');
  console.log('========================================================================');
  console.table(
    all_results.map((r) => ({
      Anime: `${r.anime_slug.substring(0, 15)}.. Ep ${r.episode}`,
      Servidor: r.server_name,
      Tipo: r.source_type === 'player_embed' ? 'Embed' : 'Mirror',
      Descargado: `${(r.bytes_downloaded / (1024 * 1024)).toFixed(1)} MB`,
      Veredicto: r.verdict,
      Codec: r.video_codec || '-',
      Res: r.resolution || '-',
    }))
  );
}

runTests().catch((e) => {
  console.error('Fatal error in runTests:', e);
  process.exit(1);
});
