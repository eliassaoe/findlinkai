// Renders the cover and closing cards (1920x1080 PNG) for a scenario.
// node cards.mjs <scenario.json> <outdir>
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
import fs from 'node:fs';
import path from 'node:path';

const [scenarioPath, outDir] = process.argv.slice(2);
const sc = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const shell = body => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;700;800&display=swap" rel="stylesheet">
<style>html,body{margin:0;width:1920px;height:1080px;font-family:Inter,Arial,sans-serif}
body{background:#0b1220;color:#fff;display:flex;flex-direction:column;justify-content:center;padding:0 150px;box-sizing:border-box;position:relative;overflow:hidden}
.glow{position:absolute;right:-220px;top:-220px;width:900px;height:900px;border-radius:50%;background:radial-gradient(circle,#2563eb55,transparent 65%)}
.brand{display:flex;align-items:center;gap:18px;font-weight:700;font-size:38px;margin-bottom:70px}
.logo{width:56px;height:56px;border-radius:12px;background:#2563eb}
h1{font-size:92px;line-height:1.05;font-weight:800;margin:0 0 40px;max-width:1500px;letter-spacing:-1.5px}
h1 em{font-style:normal;color:#60a5fa}
p{font-size:40px;color:#cbd5e1;margin:0;max-width:1400px;line-height:1.35}
.pill{display:inline-block;align-self:flex-start;margin-top:60px;background:#2563eb;color:#fff;font-weight:700;font-size:40px;padding:22px 40px;border-radius:14px}
.url{font-size:34px;color:#93c5fd;margin-top:26px}</style></head><body><div class="glow"></div>${body}</body></html>`;

const title = sc.title.replace(/ With LinkFinder AI$/, '');
const cover = shell(`<div class="brand"><div class="logo"></div>LinkFinder AI</div>
<h1>${esc(title)} <em>With LinkFinder AI</em></h1><p>${esc(sc.coverSub || 'Step-by-step tutorial')}</p>`);
const outro = shell(`<div class="brand"><div class="logo"></div>LinkFinder AI</div>
<h1>${esc(sc.outroHeadline || 'Try it on your own list')}</h1><p>${esc(sc.outroSub || 'Free account, credits included. Link in the description.')}</p>
<div class="pill">linkfinderai.com</div>`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
for (const [name, html] of [['cover', cover], ['outro', outro]]) {
  await page.setContent(html, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, name + '.png') });
}
await browser.close();
