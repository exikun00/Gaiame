import { chromium } from 'playwright';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const ARTIFACT_DIR = '/home/exilost/.gemini/antigravity-cli/brain/257d044f-693c-4b95-a186-37cac660f454';
const SCREENSHOT_DIR = path.join(ARTIFACT_DIR, 'screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Timeout waiting for server at ${url}`);
}

async function runVerification() {
  console.log('--- Iniciando Verificación en Navegador Real (AGENT.md §8): Kanojo ga Flag wo Oraretara ---');

  let serverProcess = null;
  try {
    const res = await fetch('http://localhost:3000/api/health');
    if (!res.ok) throw new Error();
    console.log('✅ Servidor detectado activo en http://localhost:3000');
  } catch {
    console.log('🚀 Iniciando servidor Express de producción...');
    serverProcess = spawn('node', ['server/dist/index.js'], {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: { ...process.env, PORT: '3000', NODE_ENV: 'production' },
    });
    await waitForServer('http://localhost:3000/api/health');
    console.log('✅ Servidor iniciado y listo para pruebas.');
  }

  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  const consoleMessages = [];
  const pageErrors = [];
  const networkRequests = [];

  page.on('console', (msg) => {
    consoleMessages.push({ type: msg.type(), text: msg.text() });
  });

  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('/api/')) {
      networkRequests.push({ url, status: res.status() });
    }
  });

  try {
    console.log('\n[1/4] Navegando a http://localhost:3000 y buscando "kanojo ga flag wo oraretara"...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

    const searchInput = page.locator('input[placeholder*="Buscar"]');
    await searchInput.waitFor({ state: 'visible', timeout: 10000 });
    await searchInput.fill('kanojo ga flag wo oraretara');
    await searchInput.press('Enter');

    // Esperar resultado en el DOM
    await page.waitForSelector('h4:has-text("Kanojo ga Flag wo Oraretara")', { timeout: 15000 });
    console.log('✅ Resultado de búsqueda encontrado en el DOM.');

    // Hacer clic en la tarjeta del anime para ir al detalle
    const animeCard = page.locator('h4:has-text("Kanojo ga Flag wo Oraretara")').first();
    await animeCard.click();

    // Esperar a que cargue la página de detalle
    await page.waitForSelector('h1:has-text("Kanojo ga Flag wo Oraretara")', { timeout: 15000 });
    console.log('✅ Vista de detalle del anime cargada.');

    // Verificar que la portada es la correcta y no la del sidebar (little-busters)
    const posterImg = page.locator('img[alt="Kanojo ga Flag wo Oraretara"]').first();
    await posterImg.waitFor({ state: 'visible', timeout: 10000 });
    const posterSrc = await posterImg.getAttribute('src');
    console.log(`🖼️ URL de portada extraída en el DOM: ${posterSrc}`);

    if (posterSrc.includes('little-busters')) {
      throw new Error(`FALLO: La portada cargada es Little Busters en lugar de Kanojo ga Flag! (${posterSrc})`);
    }
    if (!posterSrc.includes('kanojo-ga-flag-wo-oraretara')) {
      throw new Error(`FALLO: La portada no contiene el slug esperado (${posterSrc})`);
    }
    console.log('✅ Portada verificada exitosamente: corresponde 100% al anime Kanojo ga Flag wo Oraretara.');

    // Captura 1: Detalle del anime con la portada correcta
    const detailScreenshot = path.join(SCREENSHOT_DIR, 'kanojo-detail-cover.png');
    await page.screenshot({ path: detailScreenshot, fullPage: false });
    console.log(`📸 Captura de detalle guardada en: ${detailScreenshot}`);

    console.log('\n[2/4] Abriendo reproductor para el Episodio 1...');
    const firstEpPlay = page.locator('button[aria-label*="Episodio 1"]').first();
    await firstEpPlay.waitFor({ state: 'visible', timeout: 10000 });
    await firstEpPlay.click();

    // Esperar a que el modal del reproductor se abra (renderiza h3 con título "Anime — Ep. 1")
    await page.waitForSelector('h3:has-text("Ep. 1")', { timeout: 15000 });
    console.log('✅ Modal de reproducción abierto.');

    // Esperar a que se listen los servidores
    await page.waitForSelector('text=Servidores (', { timeout: 15000 });
    const serverBadges = page.locator('.overflow-x-auto button');
    const badgeCount = await serverBadges.count();
    console.log(`✅ ${badgeCount} servidores detectados en la barra de control del reproductor.`);

    // Captura 2: Reproductor con lista de servidores completa
    const playerScreenshot = path.join(SCREENSHOT_DIR, 'player-desu-optimal.png');
    await page.screenshot({ path: playerScreenshot, fullPage: false });
    console.log(`📸 Captura de reproductor con servidores guardada en: ${playerScreenshot}`);

    console.log('\n[3/4] Probando cambio de servidor interactivo...');
    const mixdropBtn = page.locator('.overflow-x-auto button:has-text("Mixdrop")').first();
    if (await mixdropBtn.count() > 0) {
      console.log('Haciendo clic en el botón de servidor "Mixdrop"...');
      await mixdropBtn.click();
      await page.waitForTimeout(1000);
      console.log('✅ Botón de servidor presionado sin bloquear la interfaz.');
    }

    // Captura 3: Cambio de servidor realizado
    const switchScreenshot = path.join(SCREENSHOT_DIR, 'player-server-switch.png');
    await page.screenshot({ path: switchScreenshot, fullPage: false });
    console.log(`📸 Captura de cambio de servidor guardada en: ${switchScreenshot}`);

    console.log('\n[4/4] Diagnóstico de Consola y Red:');
    console.log('--- Monitor de Red ---');
    for (const req of networkRequests.slice(-10)) {
      console.log(`  [HTTP ${req.status}] ${req.url}`);
    }

    const errors = consoleMessages.filter((m) => m.type === 'error');
    console.log('\n--- Logs de Consola ---');
    console.log(`  Total mensajes: ${consoleMessages.length}`);
    console.log(`  Errores en consola: ${errors.length}`);
    console.log(`  Excepciones no controladas (pageerror): ${pageErrors.length}`);

    if (errors.length > 0) {
      console.error('❌ Errores detectados en consola:', errors);
    }
    if (pageErrors.length > 0) {
      console.error('❌ Excepciones en página detectadas:', pageErrors);
    }

    await browser.close();

    const passed = errors.length === 0 && pageErrors.length === 0 && badgeCount > 0;
    if (passed) {
      console.log('\n🎉 VERIFICACIÓN EN NAVEGADOR REAL EXITOSA (AGENT.md §8 CUMPLIDO) 🎉');
      process.exit(0);
    } else {
      console.error('\n❌ VERIFICACIÓN FALLIDA');
      process.exit(1);
    }
  } finally {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
  }
}

runVerification().catch((err) => {
  console.error('Fatal error in runVerification:', err);
  process.exit(1);
});
