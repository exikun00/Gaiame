import { chromium } from 'playwright';
import path from 'path';

const ARTIFACT_DIR = '/home/exilost/.gemini/antigravity-cli/brain/257d044f-693c-4b95-a186-37cac660f454';
const SCREENSHOTS_DIR = path.join(ARTIFACT_DIR, 'screenshots');

async function testUI() {
  console.log('Testing UI /downloads and /anime/kyoufu-collector/1 with local stream...');
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  // 1. Visitar /downloads
  await page.goto('http://localhost:5173/downloads', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'downloads-completed-episode.png') });
  console.log('✔ Captura guardada: downloads-completed-episode.png');

  // 2. Visitar el episodio descargado /anime/kyoufu-collector/1
  await page.goto('http://localhost:5173/anime/kyoufu-collector/1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'local-streaming-player.png') });
  console.log('✔ Captura guardada: local-streaming-player.png');

  await browser.close();
  console.log('✔ Verificación visual completada con éxito.');
}

testUI().catch(console.error);
