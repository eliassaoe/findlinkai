// Records one scenario of the real app (app.html served locally) as JPEG frames.
// Network calls are answered from the scenario's `mocks`, which hold values
// returned by real LinkFinder AI lookups (see README.md). Nothing is invented.
//
// node render.mjs <scenario.json> <durations.json> <outdir>
//   durations.json: { "<step id>": seconds of narration, ... }
//   outdir/frames/*.jpg, outdir/frames.ffconcat, outdir/timeline.json, outdir/payoff.jpg
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const [scenarioPath, durationsPath, outDir] = process.argv.slice(2);
const sc = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'));
const durations = JSON.parse(fs.readFileSync(durationsPath, 'utf8'));
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ASSETS = path.join(ROOT, 'video_factory', 'assets');
fs.mkdirSync(path.join(outDir, 'frames'), { recursive: true });

// --- static server for the repo (app.html + js/ + css) -----------------------
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/' || p === '/app') p = '/app.html';
  let f = path.join(ROOT, p);
  if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const W = 1280, H = 720, DSF = 1.5; // frames come out 1920x1080
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DSF });
const page = await ctx.newPage();
const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- network: real values from the scenario, everything else answered empty --
const mocks = sc.mocks || {};
await page.route('**/*', async route => {
  const req = route.request(); const u = req.url();
  if (u.startsWith(BASE)) return route.continue();
  if (/fonts\.googleapis|fonts\.gstatic|cdnjs\.cloudflare/.test(u)) return route.continue();
  if (u.includes('linkfinderaicredits')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ credits: mocks.credits ?? 5000, is_unlimited: true, email_verified: true }) });
  if (u.includes('linkfinderapp.hamoureliasse')) {
    let d = {}; try { d = JSON.parse(req.postData() || '{}'); } catch (e) {}
    const key = String(d.input_data || '');
    const hit = (mocks.byInput || {})[key];
    await sleep(d.is_bulk ? (mocks.bulkDelayMs ?? 600) : (mocks.singleDelayMs ?? 2200));
    const body = hit === undefined ? { status: 'success', result: 'Not found' } : (typeof hit === 'object' ? hit : { status: 'success', result: hit });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: req.method() === 'GET' ? '[]' : '{}' });
});

await page.addInitScript(() => {
  try {
    localStorage.setItem('linkFinderToken', 'demo-token');
    localStorage.setItem('lf_onboarding_popup_seen', '1');
  } catch (e) {}
  // Video hygiene: no time-limited banner, no floating chat bubbles, a visible cursor.
  const css = `#lf-bf26,.review-notification,#reviewNotification{display:none!important}
    #lf-cursor{position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;transition:transform .05s linear}
    #lf-cursor svg{width:22px;height:22px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))}
    .lf-ripple{position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:3px solid #2563eb;z-index:2147483646;pointer-events:none;animation:lfr .6s ease-out forwards}
    @keyframes lfr{from{opacity:.9;transform:scale(.4)}to{opacity:0;transform:scale(1.6)}}`;
  const addUi = () => {
    if (document.getElementById('lf-cursor')) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const c = document.createElement('div'); c.id = 'lf-cursor';
    c.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 2l7 19 2.6-7.4L20 11z" fill="#111" stroke="#fff" stroke-width="1.5"/></svg>';
    document.body.appendChild(c);
    window.__lfMove = (x, y) => { c.style.transform = `translate(${x - 3}px,${y - 2}px)`; };
    window.__lfRipple = (x, y) => { const r = document.createElement('div'); r.className = 'lf-ripple'; r.style.left = x + 'px'; r.style.top = y + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 700); };
    window.__lfMove(innerWidth * 0.62, innerHeight * 0.55);
    // floating bubbles in the bottom corners (support chat, tasks button)
    const hideFloaters = () => document.querySelectorAll('body *').forEach(el => {
      const s = getComputedStyle(el); if (s.position !== 'fixed' || el.id === 'lf-cursor') return;
      const r = el.getBoundingClientRect();
      if (r.width < 120 && r.height < 120 && r.top > innerHeight - 160) el.style.setProperty('display', 'none', 'important');
    });
    hideFloaters(); setInterval(hideFloaters, 500);
  };
  document.addEventListener('DOMContentLoaded', addUi);
});

let cur = { x: W * 0.62, y: H * 0.55 };
async function moveTo(x, y, ms = 700) {
  const n = Math.max(8, Math.round(ms / 16));
  const sx = cur.x, sy = cur.y;
  for (let i = 1; i <= n; i++) {
    const t = i / n, e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const x1 = sx + (x - sx) * e, y1 = sy + (y - sy) * e;
    await page.mouse.move(x1, y1);
    await page.evaluate(([a, b]) => window.__lfMove && window.__lfMove(a, b), [x1, y1]);
    await sleep(16);
  }
  cur = { x, y };
}
function locate(a) {
  if (a.selector) return page.locator(a.selector).first();
  if (a.role) return page.getByRole(a.role, { name: a.name, exact: !!a.exact }).first();
  return page.getByText(a.text, { exact: !!a.exact }).first();
}
async function pointAt(loc) {
  await loc.scrollIntoViewIfNeeded();
  await sleep(250);
  const b = await loc.boundingBox();
  if (!b) throw new Error('not visible');
  const x = b.x + Math.min(b.width / 2, 120), y = b.y + b.height / 2;
  await moveTo(x, y);
  return { x, y };
}
async function runAction(a) {
  if (a.click) {
    const loc = locate(a.click); const { x, y } = await pointAt(loc);
    await page.evaluate(([p, q]) => window.__lfRipple && window.__lfRipple(p, q), [x, y]);
    await loc.click();
  } else if (a.type) {
    const loc = locate(a.type); const { x, y } = await pointAt(loc);
    await page.evaluate(([p, q]) => window.__lfRipple && window.__lfRipple(p, q), [x, y]);
    await loc.click();
    await loc.pressSequentially(a.type.value, { delay: 90 });
  } else if (a.upload) {
    const target = locate(a.upload); const { x, y } = await pointAt(target);
    await page.evaluate(([p, q]) => window.__lfRipple && window.__lfRipple(p, q), [x, y]);
    const input = page.locator(a.upload.input || 'input[type=file]').first();
    await input.setInputFiles(path.join(ASSETS, a.upload.file));
  } else if (a.hover) {
    await pointAt(locate(a.hover));
  } else if (a.scroll) {
    const loc = locate(a.scroll); await loc.scrollIntoViewIfNeeded();
    await page.evaluate(([dy]) => window.scrollBy({ top: dy, behavior: 'smooth' }), [a.scroll.offset || 0]);
  } else if (a.scrollBy) {
    await page.evaluate(([dy]) => window.scrollBy({ top: dy, behavior: 'smooth' }), [a.scrollBy]);
  } else if (a.waitText) {
    await page.getByText(a.waitText).first().waitFor({ timeout: 30000 });
  } else if (a.pause) {
    await sleep(a.pause * 1000);
  }
}

// --- screencast -----------------------------------------------------------------
const cdp = await ctx.newCDPSession(page);
const frames = [];
cdp.on('Page.screencastFrame', async f => {
  const i = frames.length;
  const file = path.join(outDir, 'frames', String(i).padStart(6, '0') + '.jpg');
  fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
  frames.push({ file, t: f.metadata.timestamp });
  try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch (e) {}
});

await page.goto(BASE + '/app.html', { waitUntil: 'domcontentloaded' });
await sleep(3500);
for (const a of sc.setup || []) { try { await runAction(a); } catch (e) { console.log('setup skipped:', e.message.split('\n')[0]); } }
await sleep(500);

await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
const t0 = Date.now() / 1000;
await sleep(400);
const timeline = [];
for (const step of sc.steps) {
  const start = Date.now() / 1000;
  timeline.push({ id: step.id, start: start - t0 });
  console.log('step', step.id);
  try { for (const a of step.do || []) await runAction(a); }
  catch (e) { await page.screenshot({ path: path.join(outDir, 'error-' + step.id + '.png') }); throw e; }
  const need = (durations[step.id] || 2) + (step.tail ?? 0.5);
  const spent = Date.now() / 1000 - start;
  if (need > spent) await sleep((need - spent) * 1000);
}
await sleep(300);
const tEnd = Date.now() / 1000;
await page.screenshot({ path: path.join(outDir, 'payoff.jpg'), type: 'jpeg', quality: 92 });
if (sc.payoffScrollTo) {
  // a second, framed shot of the finished result for step 01
  await locate(sc.payoffScrollTo).scrollIntoViewIfNeeded();
  await page.evaluate(([dy]) => window.scrollBy(0, dy), [sc.payoffOffset || 0]);
  await sleep(500);
  await page.screenshot({ path: path.join(outDir, 'payoff.jpg'), type: 'jpeg', quality: 92 });
}
await cdp.send('Page.stopScreencast');
await browser.close(); server.close();

// ffconcat: each frame lasts until the next one (screencast only sends changes)
let out = 'ffconcat version 1.0\n';
const used = frames.filter(f => f.t >= t0 - 1);
for (let i = 0; i < used.length; i++) {
  const next = i + 1 < used.length ? used[i + 1].t : tEnd;
  const startT = Math.max(used[i].t, t0);
  const d = Math.max(0.001, next - startT);
  out += `file '${used[i].file}'\nduration ${d.toFixed(3)}\n`;
}
out += `file '${used[used.length - 1].file}'\n`;
fs.writeFileSync(path.join(outDir, 'frames.ffconcat'), out);
fs.writeFileSync(path.join(outDir, 'timeline.json'), JSON.stringify({ total: tEnd - t0, steps: timeline }, null, 1));
console.log(`frames ${used.length}, ${(tEnd - t0).toFixed(1)}s`);
