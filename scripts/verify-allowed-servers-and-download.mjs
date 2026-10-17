import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import axios from 'axios';

const ARTIFACT_DIR = '/home/exilost/.gemini/antigravity-cli/brain/257d044f-693c-4b95-a186-37cac660f454';
const SCREENSHOTS_DIR = path.join(ARTIFACT_DIR, 'screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function runVerification() {
  console.log('🚀 Iniciando verificación de servidores filtrados y navegador real...');

  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();
  const console_errors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('favicon.ico')) {
      console_errors.push(msg.text());
    }
  });

  // 1. Verificar episodio de Re:Zero en navegador
  console.log('Testing /anime/rezero-kara-hajimeru-isekai-seikatsu-4th-season/16 ...');
  await page.goto('http://localhost:5173/anime/rezero-kara-hajimeru-isekai-seikatsu-4th-season/16', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Obtener nombres de servidores visibles en los ServerBadges
  const server_badges = await page.locator('button:has(span)').allInnerTexts();
  const server_names = server_badges.map(s => s.trim()).filter(s => s.length > 0 && !s.includes('←') && !s.includes('→'));
  console.log('Servidores visibles en UI:', server_names);

  // Comprobar que NO están los eliminados
  const forbidden = ['Mega', 'Desuka', 'Streamwish', 'Doodstream', '1Fichier', 'Okru'];
  for (const f of forbidden) {
    if (server_names.some(s => s.toLowerCase() === f.toLowerCase())) {
      console.error(`✘ ERROR: Servidor prohibido encontrado en UI: ${f}`);
      process.exit(1);
    }
  }
  console.log('✔ Ningún servidor prohibido (Mega, Desuka, Streamwish, etc.) está presente en la UI.');

  // Guardar captura del reproductor con los servidores filtrados
  const screenshot1 = path.join(SCREENSHOTS_DIR, 'rezero-allowed-servers.png');
  await page.screenshot({ path: screenshot1 });
  console.log(`✔ Captura guardada: ${screenshot1}`);

  // Probar interactuar con un servidor (ej. Mixdrop o Vidhide)
  const mixdrop_btn = page.locator('button:has-text("Mixdrop")').first();
  if (await mixdrop_btn.isVisible()) {
    console.log('Haciendo click en servidor Mixdrop...');
    await mixdrop_btn.click();
    await page.waitForTimeout(2000);
    const screenshot2 = path.join(SCREENSHOTS_DIR, 'rezero-mixdrop-selected.png');
    await page.screenshot({ path: screenshot2 });
    console.log(`✔ Captura guardada con Mixdrop seleccionado: ${screenshot2}`);
  }

  // 2. Verificar episodio de Kanojo ga Flag wo Oraretara Ep 3
  console.log('Testing /anime/kanojo-ga-flag-wo-oraretara/3 ...');
  await page.goto('http://localhost:5173/anime/kanojo-ga-flag-wo-oraretara/3', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const kanojo_badges = await page.locator('button:has(span)').allInnerTexts();
  const kanojo_servers = kanojo_badges.map(s => s.trim()).filter(s => s.length > 0 && !s.includes('←') && !s.includes('→'));
  console.log('Servidores en Kanojo Ep 3:', kanojo_servers);

  for (const f of forbidden) {
    if (kanojo_servers.some(s => s.toLowerCase() === f.toLowerCase())) {
      console.error(`✘ ERROR: Servidor prohibido encontrado en Kanojo: ${f}`);
      process.exit(1);
    }
  }

  const screenshot3 = path.join(SCREENSHOTS_DIR, 'kanojo-ep3-allowed-servers.png');
  await page.screenshot({ path: screenshot3 });
  console.log(`✔ Captura guardada: ${screenshot3}`);

  await browser.close();

  console.log('--- REPORTE FINAL DE VERIFICACIÓN EN NAVEGADOR ---');
  console.log(`Errores en consola: ${console_errors.length}`);
  if (console_errors.length > 0) {
    console.log('Consola errors:', console_errors);
  } else {
    console.log('✔ 0 ERRORES EN CONSOLA');
  }
}

runVerification().catch(e => {
  console.error('Fatal in runVerification:', e);
  process.exit(1);
});
