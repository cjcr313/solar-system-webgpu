import { chromium } from 'playwright-core';
import { spawn } from 'child_process';

const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], {
  cwd: '/Users/walle/.openclaw/workspace/solar-system-webgpu',
  stdio: 'ignore', detached: false
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(3500);

const URL = 'http://localhost:4173/solar-system-webgpu/';
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try {
    await page.waitForFunction(() => !document.getElementById('loading'), { timeout: 30000 });
  } catch { errors.push('loading screen nunca desapareció'); }
  await sleep(5000);

  const state = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('.body-label')].map((el) => ({
      text: el.textContent, visible: el.style.display === 'block',
      x: el.style.left, y: el.style.top, cls: el.className
    }));
    const chips = [...document.querySelectorAll('.chip')].map((c) => c.textContent);
    return {
      backend: document.getElementById('hud-backend')?.textContent,
      fps: document.getElementById('hud-fps')?.textContent,
      date: document.getElementById('hud-date')?.textContent,
      cometLabels: labels.filter((l) => l.cls.includes('comet-label')),
      visibleLabels: labels.filter((l) => l.visible).map((l) => l.text),
      cometChips: chips.filter((c) => c && /P\//.test(c)),
      toggles: [...document.querySelectorAll('#toggles button')].map((b) => b.textContent.trim())
    };
  });

  await page.evaluate(() => {
    const chip = [...document.querySelectorAll('.chip')].find((c) => c.textContent === '2P/Encke');
    if (chip) chip.click();
  });
  await sleep(6500);

  const encke = await page.evaluate(() => {
    const panel = document.getElementById('details-panel');
    const label = [...document.querySelectorAll('.comet-label')].find((l) => l.textContent.includes('Encke'));
    return {
      panelVisible: panel && !panel.classList.contains('hidden'),
      panelTitle: panel?.querySelector('h2')?.textContent,
      hasPerihelionRow: !!panel?.textContent.includes('Perihelio (q)'),
      hasNextPerihelion: !!panel?.textContent.includes('Próximo perihelion'),
      tailNote: !!panel?.textContent.includes('SIEMPRE en dirección contraria al Sol'),
      hasCutawayBtn: !!panel?.querySelector('#dp-cutaway') && panel?.querySelector('#dp-cutaway')?.style.display !== 'none',
      labelPos: label ? { left: label.style.left, top: label.style.top, display: label.style.display } : null
    };
  });

  await page.screenshot({ path: '/Users/walle/.openclaw/workspace/media/comets-encke-closeup.png' });

  await page.evaluate(() => document.getElementById('reset-view')?.click());
  await sleep(3500);
  await page.screenshot({ path: '/Users/walle/.openclaw/workspace/media/comets-general.png' });

  await page.evaluate(() => document.querySelector('[data-preset="year"]')?.click());
  await sleep(4500);
  await page.screenshot({ path: '/Users/walle/.openclaw/workspace/media/comets-fast.png' });

  const final = await page.evaluate(() => ({
    fps: document.getElementById('hud-fps')?.textContent,
    date: document.getElementById('hud-date')?.textContent
  }));

  console.log(JSON.stringify({ state, encke, final, errors }, null, 2));
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
