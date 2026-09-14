// Hourly proof that a buyer who clicks Buy lands on a live Dodo payment page.
//
// Runs from .github/workflows/checkout-canary.yml. It does what app.html does
// when a real customer clicks Buy: create one live checkout session through the
// same worker, then open the returned checkout_url the way a browser would. It
// also opens the static payment link app.html falls back to (the "second
// door"). Creating a session moves no money.
//
// Fails loudly (exit 1, which fails the workflow and emails the owner) on:
//   - the worker unreachable, non-2xx, or answering without a checkout_url
//   - a checkout_url that is not on dodopayments.com
//   - the Dodo session page, or the static link, not answering 200
//   - the Dodo page saying the session is expired, invalid or unavailable
//
// It cannot see whether a card can be charged on that page. That is what the
// PostHog alert "Checkout: buyers reached Dodo but nobody paid in 7 days" is for.
//
// Needs one secret: LF_CANARY_USER_TOKEN, a real account's token (the worker
// refuses tokens shorter than 8 chars and may look the account up). Optional:
// LF_CANARY_EMAIL, LF_CHECKOUT_WORKER.

const WORKER = process.env.LF_CHECKOUT_WORKER || 'https://dodo-checkout.hamoureliasse.workers.dev/';
const TOKEN = process.env.LF_CANARY_USER_TOKEN || '';
const EMAIL = process.env.LF_CANARY_EMAIL || '';
const PLAN = process.env.LF_CANARY_PLAN || 'payg_small';
// Keep in sync with DODO_DIRECT_PRODUCTS in app.html (tests/checkout-second-door.test.mjs pins it).
const DIRECT_PRODUCT = 'pdt_0Nj62gByZ53OzYoz3bCBr';
// Only rendered text counts: Dodo's page ships its whole translation bundle
// as JSON ("linkExpired":{"title":"Payment Link Expired"}) on every load, so
// the words alone prove nothing. A real error state is a text node between
// tags. Scanned linearly, one text node at a time: the page is one very large
// script with few tags, and a backtracking regex over the whole body hangs.
const ERROR_TEXT = /\b(?:session|link|checkout|page)\b.{0,40}\b(?:expired|invalid|not found|unavailable)\b|^\s*something went wrong\s*$|^\s*page not found\s*$/i;
function renderedErrorText(body) {
  const chunks = body.split('<');
  for (const c of chunks) {
    const i = c.indexOf('>');
    if (i === -1) continue;
    const text = c.slice(i + 1);
    if (!text.trim() || text.length > 300 || /["{}]/.test(text)) continue; // script/JSON, not prose
    if (ERROR_TEXT.test(text)) return text.trim();
  }
  return null;
}

// Nothing after the checks may keep the process alive: a cancelled streaming
// socket does, and a canary that passes but never exits sits at the job
// timeout and looks like a failure. Exit explicitly on every path, and if
// anything still holds the loop open, this unref'd timer ends it.
setTimeout(() => { console.log('::error::canary did not exit within 90s'); process.exit(2); }, 90000).unref();

const failures = [];
const fail = (msg) => { failures.push(msg); console.log('::error::' + msg); };
const ok = (msg) => console.log('ok   ' + msg);

// One deadline for headers AND body. A server that streams the page and keeps
// the connection open (Dodo's does, for a browser Accept header) would
// otherwise hang the body read forever after the header timeout was cleared.
async function fetchWithTimeout(url, opts = {}, ms = 20000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ac.signal, redirect: 'follow' });
    let body = '';
    if (r.body) {
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      try {
        while (body.length < 3_000_000) {
          const { value, done } = await reader.read();
          if (done) break;
          body += dec.decode(value, { stream: true });
        }
      } catch (e) {
        if (!body) throw e; // aborted before anything arrived
      } finally {
        try { reader.cancel().catch(() => {}); } catch (_) {}
      }
    }
    return { status: r.status, url: r.url, ok: r.ok, body, json() { try { return JSON.parse(body); } catch (_) { return {}; } } };
  } finally { clearTimeout(t); }
}

async function checkPage(label, url) {
  let r;
  try { r = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0 (LinkFinder checkout canary)' } }); }
  catch (e) { return fail(`${label}: could not be fetched (${e.name}: ${e.message})`); }
  const body = r.body;
  if (r.status === 403 && /just a moment|cf-chl|challenge-platform|cf-browser-verification/i.test(body)) {
    return console.log(`::warning::${label}: answered with a bot challenge (HTTP 403), so a robot cannot verify it; a browser is not affected.`);
  }
  if (r.status !== 200) return fail(`${label}: HTTP ${r.status} at ${r.url}`);
  const m = renderedErrorText(body);
  if (m) return fail(`${label}: page says "${m.slice(0, 80)}"`);
  ok(`${label}: 200, ${body.length} bytes`);
}

if (!TOKEN) {
  console.log('::warning::LF_CANARY_USER_TOKEN is not set, so the session path was not tested. '
    + 'Add it as a repository secret (a real account token from /account) to arm the canary.');
} else {
  const payload = {
    plan: PLAN,
    user_token: TOKEN,
    force_new_session: true,
    request_id: 'canary-' + Date.now().toString(36),
    requested_at: new Date().toISOString(),
    attribution_source: 'canary',
  };
  if (EMAIL) payload.email = EMAIL;
  let r, data = {};
  try {
    r = await fetchWithTimeout(WORKER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'https://linkfinderai.com' },
      body: JSON.stringify(payload),
    });
    data = r.json();
  } catch (e) {
    fail(`worker: unreachable (${e.name}: ${e.message})`);
  }
  if (r) {
    if (!r.ok) fail(`worker: HTTP ${r.status} ${JSON.stringify(data).slice(0, 300)}`);
    else if (!data.checkout_url) fail(`worker: 200 but no checkout_url: ${JSON.stringify(data).slice(0, 300)}`);
    else {
      let host = '';
      try { host = new URL(data.checkout_url).hostname; } catch (_) {}
      if (!host.endsWith('dodopayments.com')) fail(`worker: checkout_url on unexpected host "${host}"`);
      else {
        ok(`worker: session ${data.session_id || '(no id)'} env=${data.env || '?'} host=${host}`);
        if (data.env && data.env !== 'live') fail(`worker: env is "${data.env}", expected live`);
        await checkPage('dodo session page', data.checkout_url);
      }
    }
  }
}

await checkPage('dodo static payment link (second door)',
  `https://checkout.dodopayments.com/buy/${DIRECT_PRODUCT}?quantity=1&redirect_url=${encodeURIComponent('https://linkfinderai.com/app')}`);

if (failures.length) {
  console.log(`\n${failures.length} check(s) failed. A buyer clicking Buy right now may not reach a payment page.`);
  process.exit(1);
}
console.log('\nAll checkout paths answered. (Whether a card can be charged is the PostHog alert\'s job.)');
process.exit(0);
