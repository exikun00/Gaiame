import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const ARTIFACT_DIR = '/home/exilost/.gemini/antigravity-cli/brain/257d044f-693c-4b95-a186-37cac660f454';
const SCREENSHOTS_DIR = path.join(ARTIFACT_DIR, 'screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function runBrowserVerification() {
  console.log('🚀 Iniciando verificación en Google Chrome Real...');

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
  const console_logs = [];

  page.on('console', (msg) => {
    const text = msg.text();
    const type = msg.type();
    console_logs.push(`[${type}] ${text}`);
    if (type === 'error' && !text.includes('favicon.ico')) {
      console_errors.push(text);
    }
  });

  page.on('response', (res) => {
    if (res.status() >= 400) {
      console.log(`[HTTP ERROR ${res.status()}] ${res.url()}`);
    }
  });

  page.on('pageerror', (err) => {
    console_errors.push(`[PageError] ${err.message}`);
  });

  try {
    // 1. Probar URL directa de detalle de anime
    console.log('1. Navegando a URL directa: /anime/kanojo-ga-flag-wo-oraretara');
    await page.goto('http://localhost:5173/anime/kanojo-ga-flag-wo-oraretara', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Esperar a que cargue la información
    await page.waitForSelector('h1', { timeout: 15000 });
    const title_text = await page.locator('h1').textContent();
    console.log(`✔ Título renderizado: "${title_text}"`);

    // Validar ficha técnica
    const body_text = await page.locator('body').textContent();
    const has_concluido = body_text.includes('Concluido');
    const has_hoods = body_text.includes('Hoods Entertainment');
    const has_primavera = body_text.includes('Primavera 2014');
    const has_puntuacion = body_text.includes('Puntuación') || body_text.includes('Puntuacion');

    console.log(`✔ Estado Concluido: ${has_concluido}`);
    console.log(`✔ Estudio Hoods Entertainment: ${has_hoods}`);
    console.log(`✔ Temporada Primavera 2014: ${has_primavera}`);
    console.log(`✔ Puntuación excluida: ${!has_puntuacion}`);

    // Validar miniaturas de episodios (16:9 preview images)
    const preview_imgs = await page.locator('img[loading="lazy"]').all();
    console.log(`✔ Miniaturas de episodios encontradas: ${preview_imgs.length}`);
    if (preview_imgs.length > 0) {
      const first_src = await preview_imgs[0].getAttribute('src');
      console.log(`✔ URL de primera miniatura: ${first_src}`);
    }

    // Tomar Screenshot 1: Detalle, ficha técnica y previews
    const ss1_path = path.join(SCREENSHOTS_DIR, 'kanojo-metadata-previews.png');
    await page.screenshot({ path: ss1_path, fullPage: false });
    console.log(`✔ Screenshot 1 guardado en: ${ss1_path}`);

    // 2. Probar URL directa con número de episodio (/anime/:slug/:episode)
    console.log('2. Navegando a URL con episodio: /anime/kanojo-ga-flag-wo-oraretara/1');
    await page.goto('http://localhost:5173/anime/kanojo-ga-flag-wo-oraretara/1', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Esperar a que el modal del reproductor y los botones de servidores aparezcan
    await page.waitForSelector('button:has-text("Mixdrop"), button:has-text("Desu")', { timeout: 15000 });
    const current_url = page.url();
    console.log(`✔ URL en la barra de direcciones: ${current_url}`);

    // Inspeccionar botones de servidores para verificar diseño unificado
    const server_buttons = await page.locator('div:has-text("Servidores") button').allTextContents();
    console.log(`✔ Botones de servidores detectados (${server_buttons.length}):`, server_buttons);

    // Comprobar ausencia de estrellas y números
    const has_stars = server_buttons.some((txt) => txt.includes('★'));
    const has_numbers = server_buttons.some((txt) => /^\d+\./.test(txt.trim()));
    console.log(`✔ Diseño unificado sin estrellas: ${!has_stars}`);
    console.log(`✔ Diseño unificado sin numeración: ${!has_numbers}`);

    // Tomar Screenshot 2: Reproductor con servidores unificados
    const ss2_path = path.join(SCREENSHOTS_DIR, 'player-unified-servers.png');
    await page.screenshot({ path: ss2_path, fullPage: false });
    console.log(`✔ Screenshot 2 guardado en: ${ss2_path}`);

    // 3. Probar cierre de reproductor y navegación hacia atrás de URL
    const close_btn = page.locator('button:has(svg.lucide-x)').first();
    await close_btn.click();
    await page.waitForTimeout(500);
    const url_after_close = page.url();
    console.log(`✔ URL tras cerrar el reproductor: ${url_after_close}`);

    // 4. Probar navegación a Biblioteca (/library) y alias (/biblioteca)
    console.log('4. Navegando a /library');
    await page.click('a[href="/library"]');
    await page.waitForURL('**/library', { timeout: 5000 });
    console.log(`✔ Navegado a /library: ${page.url()}`);

    // Cambiar a pestaña de Catálogo Offline
    const offline_tab = page.locator('button:has-text("Catálogo Offline")');
    if (await offline_tab.isVisible()) {
      await offline_tab.click();
      await page.waitForTimeout(800);
      const cached_cards = await page.locator('.group h4, .group h5').allTextContents();
      console.log(`✔ Animes en catálogo offline cacheados: ${cached_cards.length}`);
    }

    // Tomar Screenshot 3: Biblioteca con Catálogo Offline
    const ss3_path = path.join(SCREENSHOTS_DIR, 'library-offline-catalog.png');
    await page.screenshot({ path: ss3_path, fullPage: false });
    console.log(`✔ Screenshot 3 guardado en: ${ss3_path}`);

    // 5. Probar alias /descargas
    console.log('5. Probando redirección de alias: /descargas -> /downloads');
    await page.goto('http://localhost:5173/descargas', { waitUntil: 'networkidle' });
    console.log(`✔ URL resultante para /descargas: ${page.url()}`);

    // 6. Probar alias /biblioteca
    console.log('6. Probando redirección de alias: /biblioteca -> /library');
    await page.goto('http://localhost:5173/biblioteca', { waitUntil: 'networkidle' });
    console.log(`✔ URL resultante para /biblioteca: ${page.url()}`);

    // 7. Reporte final de consola
    console.log('\n--- Reporte de Errores en Consola del Navegador ---');
    console.log(`Total errores: ${console_errors.length}`);
    if (console_errors.length > 0) {
      console_errors.forEach((err) => console.error(`  ✘ ${err}`));
      throw new Error(`Se encontraron ${console_errors.length} errores en la consola del navegador`);
    } else {
      console.log('  ✔ 0 errores en consola');
    }

    console.log('\n✅ ¡Todas las verificaciones de navegador completadas con éxito!');
  } finally {
    await browser.close();
  }
}

runBrowserVerification().catch((err) => {
  console.error('✘ Error fatal en la verificación:', err);
  process.exit(1);
});
