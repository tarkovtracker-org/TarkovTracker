#!/usr/bin/env node
// ponytail: zero-dep page-load measurement. Static-serves dist/ with SPA
// fallback, drives headless Chrome over CDP, reports per-page load timing.
// No puppeteer/playwright/lighthouse — uses node's global WebSocket + /usr/bin/google-chrome.
// Upgrade path: swap in Lighthouse if you need FCP/LCP/TBT category scores.
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { extname, join, resolve as resolvePath, sep } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
const log = (...a) => process.stderr.write(`[measure] ${a.join(' ')}\n`);
const num = (v, d) => (v == null || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
const DIST = join(process.cwd(), process.env.MEASURE_DIST || '.output/public');
const PORT = num(process.env.MEASURE_PORT, 4178);
const RUNS = num(process.env.MEASURE_RUNS, 5);
const CPU_THROTTLE = num(process.env.MEASURE_CPU_THROTTLE, 4);
const CHROME = process.env.CHROME_BIN || '/usr/bin/google-chrome';
const CHROME_DIR = `/tmp/measure-chrome-${process.pid}`;
const PAGES = (
  process.env.MEASURE_PAGES || '/,/tasks,/hideout,/needed-items,/settings,/team'
).split(',');
const MIME = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.html': 'text/html',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};
function startServer() {
  const distReal = realpathSync(DIST);
  const distPrefix = distReal + sep;
  const indexHtml = join(distReal, 'index.html');
  // Maps a request path to a file inside dist, or null if it escapes dist.
  // `requested` is assigned once and only read after the startsWith guard.
  const resolveRequest = (urlPath) => {
    const requested = resolvePath(join(distReal, urlPath));
    if (requested === distReal) {
      return indexHtml;
    }
    if (!requested.startsWith(distPrefix)) {
      return null;
    }
    if (existsSync(requested) && statSync(requested).isDirectory()) {
      const dirIndex = join(requested, 'index.html');
      return existsSync(dirIndex) ? dirIndex : indexHtml;
    }
    // SPA fallback for routes without a generated file
    return existsSync(requested) ? requested : indexHtml;
  };
  const server = createServer((req, res) => {
    let urlPath;
    try {
      urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    } catch {
      res.statusCode = 400;
      return res.end('bad request');
    }
    const filePath = resolveRequest(urlPath);
    if (!filePath) {
      res.statusCode = 403;
      return res.end('forbidden');
    }
    // Reject symlinks that resolve outside dist (realpath used for validation only).
    let realPath;
    try {
      realPath = realpathSync(filePath);
    } catch {
      realPath = null;
    }
    if (!realPath || !realPath.startsWith(distPrefix)) {
      res.statusCode = 404;
      return res.end('not found');
    }
    res.setHeader('content-type', MIME[extname(filePath)] || 'application/octet-stream');
    createReadStream(filePath)
      .on('error', () => {
        res.statusCode = 500;
        res.end('read error');
      })
      .pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}
function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => {
        if (address && typeof address === 'object') resolve(address.port);
        else reject(new Error('Could not allocate Chrome CDP port'));
      });
    });
  });
}
function startChrome(cdpPort) {
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${CHROME_DIR}`,
    'about:blank',
  ];
  const proc = spawn(CHROME, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  return proc;
}
async function getWsUrl(cdpPort) {
  const endpoint = `http://127.0.0.1:${cdpPort}/json/version`;
  for (let i = 0; i < 50; i++) {
    try {
      const response = await fetch(endpoint);
      const { webSocketDebuggerUrl } = await response.json();
      if (typeof webSocketDebuggerUrl === 'string') {
        const url = new URL(webSocketDebuggerUrl);
        if (
          url.protocol === 'ws:' &&
          url.hostname === '127.0.0.1' &&
          url.port === String(cdpPort) &&
          /^\/devtools\/browser\/[a-f0-9-]+$/i.test(url.pathname)
        ) {
          return `ws://127.0.0.1:${cdpPort}${url.pathname}`;
        }
      }
    } catch {
      // not ready
    }
    await sleep(100);
  }
  throw new Error('Chrome CDP endpoint never came up');
}
// Minimal CDP client over WebSocket.
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.sessions = new Map();
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      }
    });
    ws.addEventListener('close', () => {
      for (const { reject } of this.pending.values()) reject(new Error('WebSocket closed'));
      this.pending.clear();
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }
}
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', reject);
  });
}
async function measurePage(cdp, sessionId, url) {
  // Fresh navigation; clear cache so we measure cold load each run.
  await cdp.send('Network.clearBrowserCache', {}, sessionId);
  // Fixed CPU throttle for deterministic, machine-independent numbers.
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE }, sessionId);
  await cdp.send('Page.navigate', { url }, sessionId);
  // Poll until the SPA has actually rendered content (loading fallback gone +
  // real DOM inside #__nuxt), not just the load event.
  const deadline = Date.now() + 30000;
  for (;;) {
    await sleep(60);
    const { result } = await cdp.send(
      'Runtime.evaluate',
      {
        expression: `(() => {
          const n = performance.getEntriesByType('navigation')[0];
          if (!n || !n.loadEventEnd) return null;
          const root = document.getElementById('__nuxt');
          const loader = document.querySelector('.tt-loading-fallback');
          const loaderVisible = loader && loader.offsetParent !== null;
          const rendered = root && root.children.length > 0 && !loaderVisible
            && (root.innerText || '').trim().length > 0;
          if (!rendered) return null;
          const paints = performance.getEntriesByType('paint');
          const fcp = paints.find(p => p.name === 'first-contentful-paint');
          return JSON.stringify({
            domContentLoaded: n.domContentLoadedEventEnd,
            load: n.loadEventEnd,
            fcp: fcp ? fcp.startTime : null,
            ready: performance.now(),
            transferKB: Math.round((performance.getEntriesByType('resource')
              .reduce((s,r)=>s+(r.transferSize||0), n.transferSize||0))/1024),
          });
        })()`,
        returnByValue: true,
      },
      sessionId
    );
    if (result && result.value) return JSON.parse(result.value);
    if (Date.now() > deadline) throw new Error(`timeout measuring ${url}`);
  }
}
function stats(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  return { median, min, max };
}
async function main() {
  if (!existsSync(DIST)) {
    console.error(`${DIST} not found — run \`bash scripts/build-measure.sh\` first.`);
    process.exit(1);
  }
  log('starting static server on', PORT);
  const server = await startServer();
  const cdpPort = await getFreePort();
  log('launching chrome', CHROME, 'cdp', cdpPort);
  const chrome = startChrome(cdpPort);
  chrome.stderr?.on('data', (d) => {
    const s = d.toString();
    if (/error|fail|crash/i.test(s)) log('chrome:', s.trim().slice(0, 200));
  });
  chrome.on('exit', (c) => log('chrome exited code', c));
  chrome.on('error', (e) => {
    log('chrome spawn error', e.message);
    server.close();
    process.exit(1);
  });
  let ws;
  try {
    log('waiting for CDP endpoint');
    const wsUrl = await getWsUrl(cdpPort);
    log('CDP up:', wsUrl);
    ws = await connect(wsUrl);
    log('websocket connected');
    const cdp = new CDP(ws);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Network.enable', {}, sessionId);
    const base = `http://127.0.0.1:${PORT}`;
    const results = [];
    for (const page of PAGES) {
      const url = base + page;
      // warmup (discarded)
      await measurePage(cdp, sessionId, url);
      const loads = [];
      const readys = [];
      const fcps = [];
      let transferKB = 0;
      for (let i = 0; i < RUNS; i++) {
        const m = await measurePage(cdp, sessionId, url);
        loads.push(m.load);
        readys.push(m.ready);
        if (m.fcp != null) fcps.push(m.fcp);
        transferKB = m.transferKB;
      }
      const ls = stats(loads);
      const rs = stats(readys);
      const fcpStats = fcps.length ? stats(fcps) : { median: null };
      results.push({ page, load: ls.median, ready: rs.median, fcp: fcpStats.median, transferKB });
    }
    console.log(
      `\nPage-load (cold cache, ${RUNS} runs, ${CPU_THROTTLE}x CPU throttle, headless Chrome, static SPA)`
    );
    console.log(
      'page'.padEnd(16),
      'ready(ms)'.padStart(10),
      'load(ms)'.padStart(10),
      'fcp(ms)'.padStart(10),
      'xfer(KB)'.padStart(10)
    );
    for (const r of results) {
      console.log(
        r.page.padEnd(16),
        `${Math.round(r.ready)}`.padStart(10),
        `${Math.round(r.load)}`.padStart(10),
        `${r.fcp != null ? Math.round(r.fcp) : '-'}`.padStart(10),
        `${r.transferKB}`.padStart(10)
      );
    }
    console.log('');
  } finally {
    if (ws) ws.close();
    chrome.kill('SIGKILL');
    server.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
