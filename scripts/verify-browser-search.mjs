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
    } catch {
      // wait a bit
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Timeout waiting for server at ${url}`);
}

async function runBrowserVerification() {
  console.log('--- Iniciando Protocolo de Verificación en Navegador Real (AGENT.md §8) ---');

  let serverProcess = null;
  // Comprobar si el servidor ya está activo
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

  // Lanzar Chrome con perfil aislado
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  // Contenedores de diagnóstico
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
      try {
        const status = res.status();
        let payloadSummary = '';
        if (res.headers()['content-type']?.includes('application/json')) {
          const json = await res.json().catch(() => null);
          if (json && json.results) {
            payloadSummary = `results: ${json.results.length} items`;
          } else if (json) {
            payloadSummary = JSON.stringify(json).slice(0, 80);
          }
        }
        networkRequests.push({ url, status, summary: payloadSummary });
      } catch (e) {
        networkRequests.push({ url, status: res.status(), summary: 'error parsing' });
      }
    }
  });

  try {
    console.log('\n[1/5] Navegando a http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

    // Captura 1: Estado inicial
    const initialScreenshot = path.join(SCREENSHOT_DIR, 'search-initial.png');
    await page.screenshot({ path: initialScreenshot, fullPage: false });
    console.log(`📸 Captura inicial guardada en: ${initialScreenshot}`);

    // Verificar presencia del input de búsqueda
    const searchInput = page.locator('input[placeholder*="Buscar"]');
    await searchInput.waitFor({ state: 'visible', timeout: 10000 });
    console.log('✅ Input de búsqueda localizado en el DOM.');

    console.log('\n[2/5] Probando búsqueda activa: "naruto"...');
    await searchInput.fill('naruto');
    await searchInput.press('Enter');

    // Esperar a que se monte el contenedor de resultados
    const resultsHeading = page.locator('h2:has-text("Resultados para")');
    await resultsHeading.waitFor({ state: 'visible', timeout: 15000 });
    console.log('✅ Encabezado de resultados visible en el DOM.');

    // Esperar a que las tarjetas de anime se rendericen (AnimeCard renderiza h4 para el título)
    await page.waitForSelector('h4:has-text("Naruto")', { timeout: 15000 });
    const narutoCards = page.locator('h4:has-text("Naruto")');
    const cardCount = await narutoCards.count();
    console.log(`✅ ${cardCount} tarjetas de resultados con "Naruto" renderizadas en el DOM.`);

    // Captura 2: Resultados de búsqueda
    const resultsScreenshot = path.join(SCREENSHOT_DIR, 'search-results-naruto.png');
    await page.screenshot({ path: resultsScreenshot, fullPage: false });
    console.log(`📸 Captura de resultados guardada en: ${resultsScreenshot}`);

    console.log('\n[3/5] Probando búsqueda con término inexistente: "xyznonexistentanime12345"...');
    await searchInput.fill('xyznonexistentanime12345');
    await searchInput.press('Enter');

    const emptyMessage = page.locator('text=No se encontraron animes para esta búsqueda');
    await emptyMessage.waitFor({ state: 'visible', timeout: 15000 });
    console.log('✅ Mensaje de estado vacío amigable confirmado en el DOM.');

    // Captura 3: Estado vacío
    const emptyScreenshot = path.join(SCREENSHOT_DIR, 'search-empty.png');
    await page.screenshot({ path: emptyScreenshot, fullPage: false });
    console.log(`📸 Captura de estado vacío guardada en: ${emptyScreenshot}`);

    console.log('\n[4/5] Probando botón de limpieza de búsqueda (X)...');
    const clearBtn = page.locator('button[aria-label="Limpiar búsqueda"]');
    await clearBtn.waitFor({ state: 'visible', timeout: 5000 });
    await clearBtn.click();
    await page.waitForTimeout(500);
    const clearedHeading = await page.locator('h2:has-text("Resultados para")').count();
    if (clearedHeading === 0) {
      console.log('✅ Búsqueda limpiada correctamente, restaurado directorio principal.');
    }

    console.log('\n[5/5] Diagnóstico de Consola y Red:');
    console.log('--- Monitor de Red ---');
    for (const req of networkRequests) {
      console.log(`  [HTTP ${req.status}] ${req.url} -> ${req.summary}`);
    }

    const errors = consoleMessages.filter((m) => m.type === 'error');
    const warnings = consoleMessages.filter((m) => m.type === 'warning');

    console.log('\n--- Logs de Consola ---');
    console.log(`  Total mensajes: ${consoleMessages.length}`);
    console.log(`  Errores en consola: ${errors.length}`);
    console.log(`  Advertencias en consola: ${warnings.length}`);
    console.log(`  Excepciones no controladas (pageerror): ${pageErrors.length}`);

    if (errors.length > 0) {
      console.error('❌ Errores detectados en consola:', errors);
    }
    if (pageErrors.length > 0) {
      console.error('❌ Excepciones en página detectadas:', pageErrors);
    }

    await browser.close();

    const passed = errors.length === 0 && pageErrors.length === 0 && cardCount > 0;
    if (passed) {
      console.log('\n🎉 PROTOCOLO DE PRUEBAS EN NAVEGADOR SUPERADO AL 100% (AGENT.md §8 CUMPLIDO) 🎉');
      process.exit(0);
    } else {
      console.error('\n❌ EL PROTOCOLO DE PRUEBAS EN NAVEGADOR FALLÓ');
      process.exit(1);
    }
  } finally {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
  }
}

runBrowserVerification().catch((err) => {
  console.error('Fatal error running browser verification:', err);
  process.exit(1);
});
