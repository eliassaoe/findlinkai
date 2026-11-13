// Thumbnail (1280x720 PNG) for a scenario. Several styles, so the channel tests
// what gets clicked instead of repeating one look (owner, 13 Nov 2026: "fais plein
// de types de miniatures, teste plein de choses").
//
// node thumb.mjs <scenario.json> <payoff.jpg> <out.png> [style]
//
// scenario.thumb = { style, top, bottom, hook, big, rows, colIn, colOut }
//   style  banner  yellow + black banners over a result card, red arrow
//                  (the look of the channel's best LinkFinder AI thumbnails)
//          card    huge 3-line hook on the left, tilted result card on the right
//          flow    "names only" card -> big arrow -> filled card
//          number  giant count ("10/10") + FOUND stamp + result card
//          white   white background, one input -> one result, huge
//          sheet   spreadsheet look, green column filled, red circle
//   top/bottom  two short lines;  hook  card-style text, lines split on "|"
//   big    number-style figure, default "<n>/<n>";  rows  inputs to show
// Every value drawn comes from mocks.byInput, the real lookup results.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
import fs from 'node:fs';

const [scenarioPath, , outPath, styleArg] = process.argv.slice(2);
const sc = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'));
const t = sc.thumb || { top: 'LINKFINDER AI', bottom: 'In bulk' };
const style = styleArg || t.style || 'banner';
const anton = 'data:font/ttf;base64,' + fs.readFileSync(new URL('./assets/fonts/Anton.ttf', import.meta.url)).toString('base64');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const short = v => String(v).replace(/^https?:\/\/(www\.|[a-z]{2}\.)?/, '').replace(/\/$/, '');
const by = sc.mocks?.byInput || {};
const keys = (t.rows || Object.keys(by)).filter(k => by[k]);
const rows = keys.map(k => [k.split(' · ')[0], short(by[k])]);
const n = Object.keys(by).length;
const colName = t.colIn || 'Input';
const colOut = t.colOut || 'Result';

const table = (rs, { fs = 26, found = true, empty = false } = {}) => `
<table class="tb" style="font-size:${fs}px">
<tr><th>${esc(colName)}</th><th>${esc(colOut)}</th>${found ? '<th></th>' : ''}</tr>
${rs.map(([a, b]) => `<tr><td>${esc(a)}</td><td class="v">${empty ? '<span class="dots">? ? ?</span>' : esc(b)}</td>${found ? '<td><span class="ok">✓ Found</span></td>' : ''}</tr>`).join('')}
</table>`;

const logo = `<div class="logo"><svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6.5" fill="none" stroke="#fff" stroke-width="2.6"/><path d="M15 15 L21 21" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/></svg></div>`;
const redArrow = (x, y) => `<svg style="position:absolute;left:${x}px;top:${y}px;width:230px;height:250px" viewBox="0 0 230 250"><path d="M30 20 C 20 120, 70 190, 175 205" fill="none" stroke="#ef4444" stroke-width="26" stroke-linecap="round"/><path d="M150 160 L 215 210 L 140 245 Z" fill="#ef4444"/></svg>`;

const base = `
@font-face{font-family:Anton;src:url(${anton}) format("truetype")}
html,body{margin:0;width:1280px;height:720px;overflow:hidden}
body{font-family:Inter,Arial,sans-serif;position:relative}
.dark{background:radial-gradient(ellipse at 20% 110%,#3b2fbf 0%,#191a4a 45%,#0d1030 100%)}
.A{font-family:Anton,Impact,sans-serif;line-height:1;white-space:nowrap;position:absolute}
.logo{position:absolute;left:28px;bottom:26px;width:118px;height:118px;border-radius:26px;background:#2563eb;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 30px rgba(0,0,0,.5)}
.logo svg{width:70px;height:70px}
.cardbox{position:absolute;background:#fff;border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.55);padding:14px 18px}
.tb{border-collapse:collapse;color:#111827}
.tb th{text-align:left;color:#6b7280;font-weight:600;padding:8px 16px;border-bottom:2px solid #e5e7eb;font-size:.75em}
.tb td{padding:12px 16px;border-bottom:1px solid #eef0f3;font-weight:600;white-space:nowrap}
.tb td.v{color:#1d4ed8}
.ok{background:#dcfce7;color:#15803d;border-radius:8px;padding:4px 10px;font-size:.7em;font-weight:700}
.dots{color:#cbd5e1}
`;

const S = {
  banner: () => `<body class="dark"><style>
.top{left:150px;top:30px;background:#fde047;color:#0b0b0b;font-size:124px;padding:14px 34px 10px;text-transform:uppercase;letter-spacing:1px;box-shadow:0 8px 0 rgba(0,0,0,.35)}
.bot{left:330px;top:168px;background:#0b0b0b;color:#fff;font-size:100px;padding:12px 30px 8px}</style>
<div class="cardbox fitl" style="left:250px;top:300px;padding-bottom:60px">${table(rows.slice(0, 5), { fs: 30 })}</div>
${redArrow(30, 290)}
<div class="top A fit">${esc(t.top)}</div><div class="bot A fit">${esc(t.bottom)}</div>${logo}</body>`,

  card: () => `<body class="dark"><style>
.hook{left:44px;top:60px;color:#fff;font-size:150px;text-transform:uppercase;line-height:1.04}
.hook b{color:#fde047;font-weight:400}</style>
<div class="hook A fit" data-max="600">${(t.hook || `${t.top}|${t.bottom}`).split('|').map((l, i) => i === 1 ? `<b>${esc(l)}</b>` : esc(l)).join('<br>')}</div>
<div class="cardbox fitl" style="left:620px;top:110px;transform:rotate(3deg)">${table(rows.slice(0, 6), { fs: 24 })}</div>
${logo}</body>`,

  flow: () => `<body class="dark"><style>
.lab{font-size:70px;color:#fff;text-transform:uppercase}</style>
<div class="lab A" style="left:40px;top:30px">${esc(t.top)}</div>
<div class="lab A" style="left:690px;top:30px;color:#fde047">${esc(t.bottom)}</div>
<div class="cardbox" style="left:30px;top:150px;transform:rotate(-3deg)">${table(rows.slice(0, 6), { fs: 27, found: false, empty: true })}</div>
<svg style="position:absolute;left:var(--ax);top:330px;width:150px;height:110px;z-index:5" viewBox="0 0 200 140"><path d="M10 50 H120 V10 L190 70 L120 130 V90 H10 Z" fill="#fde047" stroke="#0b0b0b" stroke-width="6"/></svg>
<div class="cardbox fitl flowR" style="left:640px;top:150px;transform:rotate(2deg)">${table(rows.slice(0, 6), { fs: 27, found: false })}</div>
</body>`,

  number: () => `<body class="dark"><style>
.num{left:40px;top:20px;font-size:300px;color:#fde047;text-shadow:0 10px 0 rgba(0,0,0,.4)}
.stamp{left:70px;top:360px;font-size:110px;color:#fff;background:#16a34a;padding:10px 30px 4px;transform:rotate(-6deg);box-shadow:0 10px 0 rgba(0,0,0,.35)}
.sub{left:50px;top:560px;font-size:76px;color:#fff;text-transform:uppercase}</style>
<div class="num A fit" data-max="610">${esc(t.big || `${n}/${n}`)}</div>
<div class="stamp A">FOUND</div>
<div class="sub A fit" data-max="600">${esc(t.bottom)}</div>
<div class="cardbox fitl" style="left:640px;top:60px">${table(rows.slice(0, 7), { fs: 22, found: false })}</div>
</body>`,

  white: () => {
    const [a, b] = rows[0];
    return `<body style="background:#fff"><style>
.in{left:60px;top:130px;font-size:190px;color:#111}
.ar{left:70px;top:340px;font-size:110px;color:#ef4444}
.out{left:60px;top:450px;font-size:150px;color:#15803d;background:#dcfce7;padding:20px 36px 12px;border-radius:24px}
.tag{right:50px;top:40px;font-size:72px;background:#111;color:#fde047;padding:14px 26px 8px;transform:rotate(3deg);text-transform:uppercase}</style>
<div class="tag A">${esc(t.top)}</div>
<div class="in A fit">${esc(a)}</div><div class="ar A">▼</div><div class="out A fit">${esc(b)}</div></body>`;
  },

  sheet: () => `<body style="background:#0f9d58"><style>
.sheet{position:absolute;left:250px;top:180px;background:#fff;box-shadow:0 30px 60px rgba(0,0,0,.4);transform:rotate(-2deg)}
.sheet table{border-collapse:collapse;font-size:28px;font-family:Arial,sans-serif}
.sheet td,.sheet th{border:1px solid #dadce0;padding:12px 16px;white-space:nowrap;text-align:left}
.sheet th{background:#f1f3f4;color:#5f6368;font-weight:400}
.sheet td.v{background:#e6f4ea;color:#137333;font-weight:700}
.t1{left:30px;top:24px;font-size:120px;color:#fff;text-transform:uppercase;text-shadow:0 8px 0 rgba(0,0,0,.25)}
.t2{left:30px;top:600px;font-size:84px;color:#fde047;text-transform:uppercase;text-shadow:0 6px 0 rgba(0,0,0,.3)}</style>
<div class="t1 A fit">${esc(t.top)}</div>
<div class="sheet fitl"><table><tr><th></th><th>A · ${esc(colName)}</th><th>B · ${esc(colOut)}</th></tr>
${rows.slice(0, 5).map(([a, b], i) => `<tr><th>${i + 2}</th><td>${esc(a)}</td><td class="v">${esc(b)}</td></tr>`).join('')}</table></div>
<div class="t2 A fit">${esc(t.bottom)}</div>
</body>`,
};
if (!S[style]) throw new Error('unknown style ' + style);
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${base}</style></head>${S[style]()}</html>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
// shrink text (.fit) or tables (.fitl) that overflow the frame
await page.evaluate(() => {
  for (const el of document.querySelectorAll('.fit')) {
    const max = +(el.dataset.max || 1250);
    let fs = parseFloat(getComputedStyle(el).fontSize);
    while ((el.getBoundingClientRect().right > max || el.getBoundingClientRect().bottom > 700) && fs > 20) { fs -= 2; el.style.fontSize = fs + 'px'; }
  }
  for (const el of document.querySelectorAll('.fitl')) {
    const tb = el.querySelector('table');
    let fs = parseFloat(getComputedStyle(tb).fontSize);
    while ((el.getBoundingClientRect().right > 1265 || el.getBoundingClientRect().bottom > 715) && fs > 12) { fs -= 1; tb.style.fontSize = fs + 'px'; }
  }
});
await page.evaluate(() => {
  const r = document.querySelector('.flowR'); if (!r) return;
  const l = document.querySelector('.cardbox').getBoundingClientRect().right;
  const tb = r.querySelector('table'); r.style.left = (l + 110) + 'px';
  let fs = parseFloat(getComputedStyle(tb).fontSize);
  while (r.getBoundingClientRect().right > 1265 && fs > 12) { fs -= 1; tb.style.fontSize = fs + 'px'; }
  document.body.style.setProperty('--ax', (l - 30) + 'px');
});
await page.screenshot({ path: outPath });
await browser.close();
