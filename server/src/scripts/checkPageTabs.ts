import axios from 'axios';
import * as cheerio from 'cheerio';

async function checkPage(url: string) {
  console.log('Fetching:', url);
  const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const $ = cheerio.load(res.data);
  console.log('\n--- Player Tabs (.bg-servers a) ---');
  $('.bg-servers a').each((i, el) => {
    console.log(`[${i}] ${$(el).text().trim()} (data-id: ${$(el).attr('data-id')})`);
  });

  console.log('\n--- video[i] iframes ---');
  const videoMatches = res.data.matchAll(/video\[(\d+)\]\s*=\s*['"]<iframe[^>]*src=['"]([^'"]+)['"]/gi);
  for (const m of videoMatches) {
    console.log(`video[${m[1]}] --> ${m[2]}`);
  }

  console.log('\n--- var servers = [...] ---');
  const m = res.data.match(/var\s+servers\s*=\s*(\[\s*\{.*?\}\s*\]);/s);
  if (m && m[1]) {
    const servers = JSON.parse(m[1]);
    for (const s of servers) {
      let decoded = '';
      try {
        decoded = Buffer.from(s.remote, 'base64').toString('utf-8');
      } catch {
        decoded = s.remote;
      }
      console.log(`Server: ${s.server} (${s.slug || ''}) --> ${decoded}`);
    }
  }
}

checkPage('https://jkanime.net/rezero-kara-hajimeru-isekai-seikatsu-4th-season/16/');
