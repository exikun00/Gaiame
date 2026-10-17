import { describe, it, expect } from 'vitest';
import streamExtractor from '../services/extractor.js';
import { ScrapedServer } from '../services/scraper.js';

describe('StreamExtractor Priority & Fallback', () => {
  it('debe ordenar los servidores de streaming priorizando Desu > Magi > Mediafire > Mp4upload > Mixdrop', () => {
    const servers: ScrapedServer[] = [
      { server: 'Streamtape', raw_url: 'https://streamtape.com/e/123', slug: 's1' },
      { server: 'Desu', raw_url: 'https://desu.com/e/456', slug: 's2' },
      { server: 'Mixdrop', raw_url: 'https://mixdrop.co/e/789', slug: 's3' },
      { server: 'Mediafire', raw_url: 'https://mediafire.com/file/xyz', slug: 's4' },
      { server: 'Magi', raw_url: 'https://magi.com/e/abc', slug: 's5' },
    ];

    const sorted = streamExtractor.sortServersByPriority(servers);

    expect(sorted[0]?.server).toBe('Desu');
    expect(sorted[1]?.server).toBe('Magi');
    expect(sorted[2]?.server).toBe('Mediafire');
    expect(sorted[3]?.server).toBe('Mixdrop');
    expect(sorted[4]?.server).toBe('Streamtape');
  });

  it('debe ordenar los servidores de descarga priorizando Mediafire > Mp4upload > Desu > Magi', () => {
    const servers: ScrapedServer[] = [
      { server: 'Desu', raw_url: 'https://jkanime.net/jkplayer/um?...', slug: 's1' },
      { server: 'Mediafire', raw_url: 'https://mediafire.com/file/xyz', slug: 's2' },
      { server: 'Mixdrop', raw_url: 'https://mixdrop.top/e/123', slug: 's3' },
      { server: 'Mp4upload', raw_url: 'https://mp4upload.com/embed-123', slug: 's4' },
      { server: 'Magi', raw_url: 'https://jkanime.net/jkplayer/umv?...', slug: 's5' },
    ];

    const sorted = streamExtractor.sortServersForDownload(servers);

    expect(sorted[0]?.server).toBe('Mediafire');
    expect(sorted[1]?.server).toBe('Mp4upload');
    expect(sorted[2]?.server).toBe('Desu');
    expect(sorted[3]?.server).toBe('Magi');
  });

  it('debe aislar Desuka de Desu asignándole prioridad 0', () => {
    const p_desu = streamExtractor.getStreamPriority('Desu');
    const p_desuka = streamExtractor.getStreamPriority('Desuka');

    expect(p_desu).toBe(1000);
    expect(p_desuka).toBe(0);
    expect(p_desu).toBeGreaterThan(p_desuka);
  });

  it('debe validar streams descargables y rechazar iframes embebidos puros', () => {
    const hls_stream = {
      server_name: 'Desu',
      stream_url: 'https://nika.playmudos.com/playlist.m3u8',
      is_hls: true,
      original_embed_url: 'https://jkanime.net/jkplayer/um?...',
    };
    const direct_mp4 = {
      server_name: 'Mediafire',
      stream_url: 'https://download.mediafire.com/video.mp4',
      is_hls: false,
      original_embed_url: 'https://mediafire.com/file/123',
    };
    const pure_embed_mixdrop = {
      server_name: 'Mixdrop',
      stream_url: 'https://mixdrop.top/e/pjkgpqrgsd3og6',
      is_hls: false,
      original_embed_url: 'https://mixdrop.top/e/pjkgpqrgsd3og6',
    };
    const pure_embed_streamtape = {
      server_name: 'Streamtape',
      stream_url: 'https://streamtape.com/e/qW0pwLBlKqIzzBa/test.mp4',
      is_hls: false,
      original_embed_url: 'https://streamtape.com/e/qW0pwLBlKqIzzBa/test.mp4',
    };

    expect(streamExtractor.isDownloadableStream(hls_stream)).toBe(true);
    expect(streamExtractor.isDownloadableStream(direct_mp4)).toBe(true);
    expect(streamExtractor.isDownloadableStream(pure_embed_mixdrop)).toBe(false);
    expect(streamExtractor.isDownloadableStream(pure_embed_streamtape)).toBe(false);
  });
});
