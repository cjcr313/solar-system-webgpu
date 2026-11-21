import { chromium } from 'playwright-core';
import { spawn } from 'child_process';

const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], {
  cwd: '/Users/walle/.openclaw/workspace/solar-system-webgpu',
  stdio: 'ignore', detached: false
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(3500);

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

try {
  await page.goto('http://localhost:4173/solar-system-webgpu/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => !document.getElementById('loading'), { timeout: 30000 });
  await sleep(3000);

  // PAUSAR + viajar al perihelio de Encke (~8 feb 2027 → días J2000 ≈ 9899)
  await page.evaluate(() => {
    document.getElementById('btn-pause')?.click();
    window.__solarSetDate(9899);
  });
  await sleep(800);

  // fecha mostrada + focus Encke
  const dateShown = await page.evaluate(() => document.getElementById('hud-date')?.textContent);
  await page.evaluate(() => {
    const chip = [...document.querySelectorAll('.chip')].find((c) => c.textContent === '2P/Encke');
    chip?.click();
  });
  await sleep(500);
  // reanudar a velocidad real para ver flujo sutil y capturar
  await page.evaluate(() => {
    const st = window.__solarSetDate; // existe
    const rt = document.querySelector('[data-preset="realtime"]');
    rt?.click();
    document.getElementById('btn-pause')?.click();
  });
  await sleep(2500);
  await page.screenshot({ path: '/Users/walle/.openclaw/workspace/media/comets-perihelion.png' });

  const final = await page.evaluate(() => ({
    fps: document.getElementById('hud-fps')?.textContent,
    date: document.getElementById('hud-date')?.textContent,
    panel: document.getElementById('details-panel')?.querySelector('h2')?.textContent
  }));
  console.log(JSON.stringify({ dateShown, final, errors }, null, 2));
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
