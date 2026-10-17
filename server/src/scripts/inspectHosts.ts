import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'node:fs';

const urls: Record<string, string> = {
  mixdrop: 'https://mixdrop.top/e/pjkgpqrgsd3og6',
  vidhide: 'https://vidhidevip.com/embed/lgpg1d6m8gk1',
  filemoon: 'https://bysekoze.com/e/ljpbgmn3ylkk/',
  voe: 'https://voe.sx/e/wsdvdaikmqze',
  streamtape: 'https://streamtape.com/e/qW0pwLBlKqIzzBa/reeezerookaraaahajiimeruisekaiseka4seasonss-16.mp4',
};

async function inspectHost(name: string, url: string) {
  console.log(`\n=================== ${name.toUpperCase()} ===================`);
  console.log(`URL: ${url}`);
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://jkanime.net/',
      },
      timeout: 10000,
      validateStatus: () => true,
    });

    console.log(`HTTP Status: ${res.status}`);
    console.log(`Content-Type: ${res.headers['content-type']}`);
    const html = typeof res.data === 'string' ? res.data : '';
    console.log(`HTML Length: ${html.length}`);

    // Check for iframes
    const $ = cheerio.load(html);
    const iframes: string[] = [];
    $('iframe').each((_, el) => {
      const src = $(el).attr('src');
      if (src) iframes.push(src);
    });
    console.log(`Found ${iframes.length} iframes:`, iframes);

    // Check for video/source
    const video_sources: string[] = [];
    $('video, source').each((_, el) => {
      const src = $(el).attr('src');
      if (src) video_sources.push(src);
    });
    console.log(`Found video sources:`, video_sources);

    // Check for scripts containing m3u8 or mp4
    const script_content = $('script')
      .map((_, el) => $(el).html() || '')
      .get()
      .join('\n');

    const m3u8_matches = script_content.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/g) || [];
    const mp4_matches = script_content.match(/https?:\/\/[^"'\s\\]+\.mp4[^"'\s\\]*/g) || [];
    console.log(`M3U8 in scripts (${m3u8_matches.length}):`, m3u8_matches.slice(0, 3));
    console.log(`MP4 in scripts (${mp4_matches.length}):`, mp4_matches.slice(0, 3));

    // Check for packer eval
    const packed = script_content.match(/eval\(function\(p,a,c,k,e,d\)[^\n]+/g) || [];
    console.log(`Packed scripts count: ${packed.length}`);

    // Check for MDCore (Mixdrop)
    const mdcore = script_content.match(/MDCore[^\n;]+/g) || [];
    console.log(`MDCore matches:`, mdcore);

    // Check for streamtape videolink
    const st_match = script_content.match(/document\.getElementById\('videolink'\)[^\n]+/g) || [];
    console.log(`Streamtape videolink script:`, st_match);

    // Save html sample for inspection
    fs.writeFileSync(`/tmp/sample_${name}.html`, html, 'utf-8');
    console.log(`Saved full HTML to /tmp/sample_${name}.html`);
  } catch (err: any) {
    console.error(`Error inspecting ${name}:`, err.message);
  }
}

async function run() {
  for (const [name, url] of Object.entries(urls)) {
    await inspectHost(name, url);
  }
}

run();
