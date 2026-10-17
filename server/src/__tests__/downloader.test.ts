import { describe, it, expect } from 'vitest';
import streamExtractor from '../services/extractor.js';

describe('Downloader Protection & Stream Compatibility', () => {
  it('debe catalogar como descargable un stream HLS legítimo', () => {
    const valid_hls = {
      server_name: 'Desu',
      stream_url: 'https://nika.playmudos.com/stream.m3u8',
      is_hls: true,
      original_embed_url: 'https://jkanime.net/jkplayer/um?e=123',
    };
    expect(streamExtractor.isDownloadableStream(valid_hls)).toBe(true);
  });

  it('debe catalogar como descargable un archivo MP4 directo de Mediafire o Mp4upload', () => {
    const valid_mediafire = {
      server_name: 'Mediafire',
      stream_url: 'https://download1649.mediafire.com/video.mp4',
      is_hls: false,
      original_embed_url: 'https://mediafire.com/file/xyz',
    };
    const valid_mp4upload = {
      server_name: 'Mp4upload',
      stream_url: 'https://a3.mp4upload.com:183/d/video.mp4',
      is_hls: false,
      original_embed_url: 'https://www.mp4upload.com/embed-123.html',
    };

    expect(streamExtractor.isDownloadableStream(valid_mediafire)).toBe(true);
    expect(streamExtractor.isDownloadableStream(valid_mp4upload)).toBe(true);
  });

  it('debe RECHAZAR para descarga local iframes de embed como Mixdrop, Vidhide, Filemoon, VOE, Streamtape', () => {
    const embed_mixdrop = {
      server_name: 'Mixdrop',
      stream_url: 'https://mixdrop.top/e/pjkgpqrgsd3og6',
      is_hls: false,
      original_embed_url: 'https://mixdrop.top/e/pjkgpqrgsd3og6',
    };
    const embed_vidhide = {
      server_name: 'Vidhide',
      stream_url: 'https://vidhidevip.com/embed/lgpg1d6m8gk1',
      is_hls: false,
      original_embed_url: 'https://vidhidevip.com/embed/lgpg1d6m8gk1',
    };
    const embed_filemoon = {
      server_name: 'Filemoon',
      stream_url: 'https://bysekoze.com/e/ljpbgmn3ylkk/',
      is_hls: false,
      original_embed_url: 'https://bysekoze.com/e/ljpbgmn3ylkk/',
    };
    const embed_voe = {
      server_name: 'VOE',
      stream_url: 'https://voe.sx/e/wsdvdaikmqze',
      is_hls: false,
      original_embed_url: 'https://voe.sx/e/wsdvdaikmqze',
    };
    const embed_streamtape = {
      server_name: 'Streamtape',
      stream_url: 'https://streamtape.com/e/qW0pwLBlKqIzzBa/test.mp4',
      is_hls: false,
      original_embed_url: 'https://streamtape.com/e/qW0pwLBlKqIzzBa/test.mp4',
    };

    expect(streamExtractor.isDownloadableStream(embed_mixdrop)).toBe(false);
    expect(streamExtractor.isDownloadableStream(embed_vidhide)).toBe(false);
    expect(streamExtractor.isDownloadableStream(embed_filemoon)).toBe(false);
    expect(streamExtractor.isDownloadableStream(embed_voe)).toBe(false);
    expect(streamExtractor.isDownloadableStream(embed_streamtape)).toBe(false);
  });
});
