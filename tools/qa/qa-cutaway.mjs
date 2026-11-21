import { chromium } from 'playwright-core';
import { spawn } from 'child_process';

const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], {
  cwd: '/Users/walle/.openclaw/workspace/solar-system-webgpu', stdio: 'ignore', detached: false
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(3500);

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

try {
  await page.goto('http://localhost:4173/solar-system-webgpu/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => !document.getElementById('loading'), { timeout: 30000 });
  await sleep(2500);

  // 1) Focus Tierra
  await page.evaluate(() => {
    const chip = [...document.querySelectorAll('.chip')].find((c) => c.textContent === 'Tierra');
    chip?.click();
  });
  await sleep(4000);
  await page.screenshot({ path: '/Users/walle/.openclaw/workspace/media/qa-tierra-focus.png' });

  // 2) Abrir corte interior (botón ◫ del panel)
  const cutBtn = await page.evaluate(() => {
    const b = document.getElementById('dp-cutaway');
    if (!b) return 'NO EXISTE';
    const hidden = getComputedStyle(b).display === 'none';
    if (!hidden) b.click();
    return hidden ? 'OCULTO' : 'CLIC_OK';
  });
  await sleep(2500); // animación ~0.6s + margen
  await page.screenshot({ path: '/Users/walle/.openclaw/workspace/media/qa-tierra-cutaway.png' });

  // 3) Estado del panel + hint
  const state = await page.evaluate(() => ({
    panel: document.getElementById('details-panel')?.querySelector('h2')?.textContent,
    cutawayActivo: !!document.querySelector('#dp-cutaway.active'),
    hintVisible: (() => { const h = document.getElementById('cutaway-hint'); return h ? h.style.display !== 'none' : false; })(),
    cajasCutaway: document.querySelectorAll('.cutaway-label').length
  }));

  // 4) Vista desde otro ángulo (orbitar: drag en canvas)
  await page.mouse.move(800, 450);
  await page.mouse.down();
  await page.mouse.move(1050, 350, { steps: 12 });
  await page.mouse.up();
  await sleep(1500);
  await page.screenshot({ path: '/Users/walle/.openclaw/workspace/media/qa-tierra-cutaway-angulo.png' });

  // 5) Cerrar corte y verificar que vuelve
  await page.evaluate(() => document.getElementById('dp-cutaway')?.click());
  await sleep(1500);
  await page.screenshot({ path: '/Users/walle/.openclaw/workspace/media/qa-tierra-cutaway-cerrado.png' });

  console.log(JSON.stringify({ cutBtn, state, errors }, null, 2));
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
