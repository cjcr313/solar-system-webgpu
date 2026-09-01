#!/usr/bin/env node
/**
 * cdp-shot.mjs — Captura screenshot de la app tras una espera REAL,
 * vía Chrome DevTools Protocol (Chrome headless + WebSocket nativo).
 * Uso: node cdp-shot.mjs <url> <espera_ms> <salida.png>
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync } from 'node:fs';

const execFileP = promisify(execFile);
const [, , url, waitMs = '12000', out = '/tmp/cdp-shot.png'] = process.argv;

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;

const chrome = execFileP(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--user-data-dir=/tmp/cdp-profile',
  '--window-size=1680,950',
  'about:blank'
]).catch(() => {}); // el proceso vive hasta que lo matemos

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // esperar que el puerto debugger levante
  let targets;
  for (let i = 0; i < 50; i++) {
    await sleep(200);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      targets = await res.json();
      if (targets.length) break;
    } catch {}
  }
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });

  let id = 0;
  const pending = new Map();
  const logs = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
    if (m.method === 'Runtime.consoleAPICalled') {
      logs.push(`[console.${m.params.type}] ${m.params.args?.map((a) => a.value ?? a.description ?? '').join(' ')}`);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      logs.push(`[EXCEPTION] ${d.text} ${d.exception?.description ?? ''}`);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res) => {
      const mid = ++id;
      pending.set(mid, res);
      ws.send(JSON.stringify({ id: mid, method, params }));
    });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url });
  await sleep(Number(waitMs));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  console.log('SCREENSHOT OK →', out);
  console.log('--- console de la página ---');
  for (const l of logs.slice(-30)) console.log(l);
  ws.close();
}

main()
  .catch((e) => { console.error('FALLO:', e); process.exitCode = 1; })
  .finally(() => { setTimeout(() => process.exit(0), 300); });
