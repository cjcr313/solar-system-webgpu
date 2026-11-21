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

const R = [];
const check = (name, ok, extra = '') => R.push((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' · ' + extra : ''));

try {
  await page.goto('http://localhost:4173/solar-system-webgpu/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => !document.getElementById('loading'), { timeout: 30000 });
  await sleep(3000);

  // 1-2. carga y backend
  const st0 = await page.evaluate(() => ({
    backend: document.getElementById('hud-backend')?.textContent,
    fps: parseInt(document.getElementById('hud-fps')?.textContent || '0'),
    date: document.getElementById('hud-date')?.textContent
  }));
  check('1. Carga sin errores JS', errors.length === 0, errors[0] || '');
  check('2. Backend activo', st0.backend === 'WebGPU' || st0.backend === 'WebGL2', st0.backend);
  check('2b. FPS razonable', st0.fps >= 30, st0.fps + ' fps');

  // 3. chips
  const chips = await page.evaluate(() => [...document.querySelectorAll('.chip')].map((c) => c.textContent.trim()));
  const wantChips = ['Sol','Mercurio','Venus','Tierra','Marte','Júpiter','Saturno','Urano','Neptuno','Plutón','1P/Halley','2P/Encke','67P/Churyumov–G.','109P/Swift–Tuttle'];
  check('3. Chips completos (14)', wantChips.every((w) => chips.includes(w)), chips.length + ' chips');

  // 4. modo escala
  await page.evaluate(() => document.getElementById('mode-real')?.click());
  await sleep(400);
  const realActive = await page.evaluate(() => document.getElementById('mode-real')?.classList.contains('active'));
  check('4. Modo 1:1 Real activable', realActive);
  await page.evaluate(() => document.getElementById('mode-didactic')?.click());
  await sleep(400);

  // 5. sliders
  await page.evaluate(() => {
    const s = document.getElementById('dist-slider');
    s.value = '2'; s.dispatchEvent(new Event('input'));
  });
  const distLbl = await page.evaluate(() => document.getElementById('dist-val')?.textContent);
  check('5. Slider distancias', distLbl === '2.00×', distLbl);
  await page.evaluate(() => {
    const s = document.getElementById('dist-slider');
    s.value = '1'; s.dispatchEvent(new Event('input'));
  });

  // 6. toggles ×5
  const tg = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#toggles button')];
    const first = rows[0];
    const before = first.querySelector('.toggle-track').classList.contains('on');
    first.click();
    const after = first.querySelector('.toggle-track').classList.contains('on');
    first.click(); // restaurar
    return { n: rows.length, toggled: before !== after };
  });
  check('6. Toggles visibilidad (5, conmutan)', tg.n === 5 && tg.toggled, tg.n + ' filas');

  // 7. presets + pausa + invertir
  const time = await page.evaluate(async () => {
    const d0 = document.getElementById('hud-date').textContent;
    document.getElementById('btn-pause').click();
    await new Promise((r) => setTimeout(r, 1200));
    const dPaused = document.getElementById('hud-date').textContent;
    document.getElementById('btn-pause').click();
    await new Promise((r) => setTimeout(r, 1200));
    const dRun = document.getElementById('hud-date').textContent;
    document.getElementById('btn-reverse').click();
    await new Promise((r) => setTimeout(r, 1200));
    const dRev = document.getElementById('hud-date').textContent;
    document.getElementById('btn-reverse').click();
    return { d0, dPaused, dRun, dRev };
  });
  check('7. Pausa congela fecha', time.d0 === time.dPaused, time.d0 + ' → ' + time.dPaused);
  check('7b. Reanudar avanza', time.d0 !== time.dRun);
  check('7c. Invertir retrocede', time.dRun !== time.dRev);

  // 8. presets de velocidad activan
  await page.evaluate(() => document.querySelector('[data-preset="month"]')?.click());
  const presetActive = await page.evaluate(() => document.querySelector('[data-preset="month"]')?.classList.contains('active'));
  check('8. Preset velocidad activo', presetActive);
  await page.evaluate(() => document.querySelector('[data-preset="day"]')?.click());

  // 9. seleccionar cuerpo → panel
  await page.evaluate(() => {
    [...document.querySelectorAll('.chip')].find((c) => c.textContent.trim() === 'Marte').click();
  });
  await sleep(800);
  const panel = await page.evaluate(() => ({
    visible: !document.getElementById('details-panel')?.classList.contains('hidden'),
    title: document.getElementById('details-panel')?.querySelector('h2')?.textContent,
    tabs: [...document.querySelectorAll('[data-tab]')].map((t) => t.textContent)
  }));
  check('9. Panel abre con Marte', panel.visible && panel.title === 'Marte', panel.title);

  // 10. pestañas ×5 renderizan
  const tabsOk = await page.evaluate(() => {
    const out = [];
    for (const t of ['overview','structure','atmosphere','physics','exploration']) {
      const btn = document.querySelector('[data-tab="' + t + '"]');
      btn.click();
      const body = document.getElementById('details-panel').textContent;
      out.push(body.length > 100);
    }
    document.querySelector('[data-tab="overview"]').click();
    return out.every(Boolean);
  });
  check('10. 5 pestañas renderizan', tabsOk);

  // 11. focus centra el cuerpo
  await page.evaluate(() => document.getElementById('dp-focus')?.click());
  await sleep(3000);
  const marteLbl = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.body-label')].find((l) => l.textContent === 'Marte');
    if (!el || el.style.display === 'none') return null;
    return { x: parseFloat(el.style.left), y: parseFloat(el.style.top) };
  });
  check('11. Focus centra Marte', !!marteLbl && Math.abs(marteLbl.x - 800) < 250, marteLbl ? marteLbl.x.toFixed(0) + ',' + marteLbl.y.toFixed(0) : 'label no visible');

  // 12. cutaway abre y cierra
  const cut = await page.evaluate(async () => {
    document.getElementById('dp-cutaway').click();
    await new Promise((r) => setTimeout(r, 1500));
    const on = document.getElementById('dp-cutaway').classList.contains('active');
    document.getElementById('dp-cutaway').click();
    await new Promise((r) => setTimeout(r, 1200));
    const off = !document.getElementById('dp-cutaway').classList.contains('active');
    return on && off;
  });
  check('12. Cutaway abre/cierra', cut);

  // 13. label clickeable selecciona
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('.body-label')].find((l) => l.textContent.includes('Saturno'));
    el?.click();
  });
  await sleep(700);
  const selTitle = await page.evaluate(() => document.getElementById('details-panel')?.querySelector('h2')?.textContent);
  check('13. Clic en label selecciona', selTitle === 'Saturno', selTitle);

  // 14. panel colapsable (tecla H)
  await page.keyboard.press('h');
  await sleep(500);
  const hHidden = await page.evaluate(() => document.getElementById('hud-panel')?.classList.contains('panel-hidden'));
  await page.keyboard.press('h');
  await sleep(300);
  const hShown = await page.evaluate(() => !document.getElementById('hud-panel')?.classList.contains('panel-hidden'));
  check('14. Tecla H colapsa/expande', hHidden && hShown);

  // 15. reset view
  await page.evaluate(() => document.getElementById('reset-view')?.click());
  await sleep(2000);
  check('15. Vista general sin errores tras todo', errors.length === 0, errors[0] || '');

  // 16. toggle cometas oculta labels ☄️
  const cometsTgl = await page.evaluate(() => {
    const row = [...document.querySelectorAll('#toggles button')].find((b) => b.textContent.includes('Cometas'));
    const before = [...document.querySelectorAll('.comet-label')].some((l) => l.style.visibility !== 'hidden');
    row.click();
    const hidden = [...document.querySelectorAll('.comet-label')].every((l) => l.style.visibility === 'hidden');
    row.click();
    return { before, hidden };
  });
  check('16. Toggle Cometas oculta labels ☄️', cometsTgl.before && cometsTgl.hidden);

  // 17. cometa seleccionable con panel propio
  await page.evaluate(() => {
    [...document.querySelectorAll('.chip')].find((c) => c.textContent.includes('Halley')).click();
  });
  await sleep(700);
  const halley = await page.evaluate(() => ({
    title: document.getElementById('details-panel')?.querySelector('h2')?.textContent,
    perihelio: document.getElementById('details-panel')?.textContent.includes('Perihelio (q)'),
    retrógrado: document.getElementById('details-panel')?.textContent.includes('Retrógrado')
  }));
  check('17. Halley panel científico', halley.title === '1P/Halley' && halley.perihelio && halley.retrógrado, halley.title);

  const fpsEnd = await page.evaluate(() => document.getElementById('hud-fps')?.textContent);
  console.log(R.join('\n'));
  console.log('--- FPS final: ' + fpsEnd + ' · errores: ' + (errors.length ? JSON.stringify(errors.slice(0,3)) : '0'));
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
