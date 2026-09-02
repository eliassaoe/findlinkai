/**
 * Sharing the value summary — account.html's "Share" card.
 *
 * The point of the feature is marketing that costs nothing: a user posts their
 * own numbers and the post says where they came from. That only works if three
 * things are true every time, and each of them is easy to break by accident:
 *
 *   1. The branding is IN THE PICTURE. Feeds crop captions and strip links out
 *      of images, so a card without the wordmark and the domain painted on it
 *      is an anonymous number.
 *   2. The link is in the post text, on every network, and it is the user's own
 *      referral link when they have one — that is the reward that makes them
 *      post, and the attribution that tells us whether any of this works.
 *   3. Nothing but the totals leaves the page. The card is built from a summary
 *      that sits next to real contact data; painting a name onto something a
 *      user broadcasts would be unforgivable.
 *
 * Run: node --test tests/value-share.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const page = readFileSync(join(REPO, 'account.html'), 'utf8');

function lift(name) {
  let start = page.indexOf(`function ${name}(`);
  assert.ok(start > 0, `account.html no longer defines ${name}`);
  if (page.slice(start - 6, start) === 'async ') start -= 6;
  let i = page.indexOf('{', page.indexOf(')', start));
  for (let d = 0; i < page.length; i++) {
    if (page[i] === '{') d++;
    else if (page[i] === '}' && --d === 0) break;
  }
  return page.slice(start, i + 1);
}

function declaration(prefix, endsWith) {
  const at = page.indexOf(prefix);
  assert.ok(at > 0, `account.html no longer declares ${prefix}`);
  const end = page.indexOf(endsWith, at);
  assert.ok(end > at, `${prefix} no longer ends with ${endsWith}`);
  return page.slice(at, end + endsWith.length);
}

/**
 * A 2D context that paints nothing and remembers everything. The card is drawn
 * with real canvas calls, so this is the only way to assert on what it says.
 */
function recorder() {
  const texts = [];
  const noop = () => {};
  return {
    texts,
    setTransform: noop, fillRect: noop, beginPath: noop, fill: noop, stroke: noop,
    roundRect: noop, arc: noop, moveTo: noop, lineTo: noop, closePath: noop,
    createRadialGradient: () => ({ addColorStop: noop }),
    fillText: (t, x, y) => texts.push({ text: String(t), x, y }),
    strokeText: noop,
    measureText: (t) => ({ width: String(t).length * 8 }),
  };
}

function context() {
  const rec = recorder();
  const canvas = { width: 0, height: 0, getContext: () => rec };
  const ctx = {
    document: { getElementById: (id) => (id === 'shareCanvas' ? canvas : null) },
    URLSearchParams, Number, String, Object, Array, Math, JSON,
  };
  vm.createContext(ctx);
  const asVar = (s) => s.replace(/^const /, 'var ');
  vm.runInContext(
    [
      asVar(declaration('const VALUE_TILES = [', '];')),
      asVar(declaration('const valueNum =', ';')),
      asVar(declaration('const SHARE_SITE =', ';')),
      asVar(declaration('const SHARE_COMMISSION =', ';')),
      asVar(declaration('const CARD_W =', ';')),
      asVar(declaration('const CARD_TILE_COLS =', ';')),
      lift('valueShareLink'),
      lift('valueCardModel'),
      lift('valueShareText'),
      lift('drawShareLogo'),
      lift('drawValueCard'),
      lift('shareCardFilename'),
      lift('shareIntentUrl'),
      lift('shareFootText'),
    ].join('\n'),
    ctx,
  );
  ctx.rec = rec;
  ctx.canvas = canvas;
  return ctx;
}

/** The owner's real figures, as the RPC returns them. */
const REAL = {
  all_time: { emails: 721, people: 1054, phones: 244, profiles: 753,
              websites: 1534, companies: 550, profiles_full: 127 },
  last_30: { emails: 251, people: 345, phones: 80, profiles: 446,
             websites: 998, companies: 89, profiles_full: 25 },
};

const painted = (ctx, summary, range) => {
  ctx.drawValueCard(ctx.valueCardModel(summary, range));
  return ctx.rec.texts.map((t) => t.text);
};

// ---------------------------------------------------------------------------
// 1. The branding is in the picture
// ---------------------------------------------------------------------------

test('the card paints the wordmark and the domain', () => {
  const ctx = context();
  const words = painted(ctx, REAL, 'last_30');

  assert.ok(words.includes('LinkFinder AI'), 'the card must name the product');
  assert.ok(words.includes('linkfinderai.com'),
    'a feed strips links out of images, so the address has to be painted on');
});

test('the branding survives a card with only one category', () => {
  const ctx = context();
  const words = painted(ctx, { last_30: { emails: 3 } }, 'last_30');

  assert.ok(words.includes('LinkFinder AI'));
  assert.ok(words.includes('linkfinderai.com'));
});

test('the card says which period it covers', () => {
  const a = context(), b = context();
  assert.ok(painted(a, REAL, 'last_30').includes('Last 30 days'));
  assert.ok(painted(b, REAL, 'all_time').includes('All time'));
});

// ---------------------------------------------------------------------------
// 2. The card's own numbers agree
// ---------------------------------------------------------------------------

test('every category fits on the card, so the tiles add up to the hero', () => {
  const ctx = context();
  const model = ctx.valueCardModel(REAL, 'all_time');

  assert.strictEqual(model.tiles.length, 7, 'no category may be dropped');
  const sum = model.tiles.reduce((s, t) => s + t.value, 0);
  assert.strictEqual(sum, model.total);
  assert.strictEqual(model.hero, '4,983');
});

test('the hero is painted, and it is the total', () => {
  const ctx = context();
  assert.ok(painted(ctx, REAL, 'last_30').includes('2,234'));
});

test('an untiled bucket from the RPC does not reach the card', () => {
  const ctx = context();
  const model = ctx.valueCardModel({ last_30: { emails: 10, other: 900 } }, 'last_30');
  assert.strictEqual(model.total, 10);
  assert.strictEqual(model.tiles.map((t) => t.label).join('|'), 'Email addresses');
});

// ---------------------------------------------------------------------------
// 3. Nothing but the totals is painted
// ---------------------------------------------------------------------------

test('the card paints only labels, numbers and branding — never contact data', () => {
  const ctx = context();
  const allowed = new Set([
    'LinkFinder AI', 'linkfinderai.com', 'contacts and companies found',
    'Last 30 days', 'All time', 'Find anyone’s email, phone and LinkedIn',
    ...ctx.VALUE_TILES.map((t) => t.label),
  ]);

  for (const word of painted(ctx, REAL, 'all_time')) {
    if (allowed.has(word)) continue;
    assert.match(word, /^[\d,]+$/, `the card painted "${word}", which is neither a label nor a count`);
  }
});

test('the model carries counts only — no row-level data comes with it', () => {
  const ctx = context();
  const model = ctx.valueCardModel(REAL, 'all_time');
  for (const t of model.tiles) {
    assert.deepStrictEqual(Object.keys(t).sort(), ['dot', 'label', 'value']);
  }
});

// ---------------------------------------------------------------------------
// 4. The link, which is the whole point
// ---------------------------------------------------------------------------

test('the link is the user’s referral link when they have a code', () => {
  const ctx = context();
  const link = ctx.valueShareLink('linkedin', 'ELIAS42');

  assert.match(link, /^https:\/\/linkfinderai\.com\//);
  assert.match(link, /[?&]ref=ELIAS42(&|$)/, 'the referral code is the reward and the attribution');
  assert.match(link, /utm_source=linkedin/);
  assert.match(link, /utm_medium=share/);
});

test('no referral code still produces a working, attributed link', () => {
  const ctx = context();
  for (const code of ['', null, undefined]) {
    const link = ctx.valueShareLink('x', code);
    assert.match(link, /^https:\/\/linkfinderai\.com\/\?/);
    assert.doesNotMatch(link, /ref=/, 'an empty code must not post ?ref=');
    assert.match(link, /utm_source=x/);
  }
});

test('every network gets a post that carries the link', () => {
  const ctx = context();
  const model = ctx.valueCardModel(REAL, 'last_30');

  for (const network of ['linkedin', 'x', 'slack', 'email']) {
    const link = ctx.valueShareLink(network, 'ELIAS42');
    const { subject, text } = ctx.valueShareText(network, model, link);
    assert.ok(text.includes(link), `the ${network} post dropped the link`);
    assert.ok(text.includes('LinkFinder AI'), `the ${network} post does not name the product`);
    assert.ok(text.includes('2,234'), `the ${network} post lost the number`);
    assert.ok(subject.length > 0 && subject.length < 90);
  }
});

test('the post says which period the number covers', () => {
  const ctx = context();
  const link = 'https://linkfinderai.com/?ref=X';
  assert.match(ctx.valueShareText('x', ctx.valueCardModel(REAL, 'last_30'), link).text,
    /in the last 30 days/);
  assert.match(ctx.valueShareText('x', ctx.valueCardModel(REAL, 'all_time'), link).text,
    /since I started/);
});

test('the X post fits in a tweet', () => {
  const ctx = context();
  // The worst case is the longest number this can produce alongside the longest link.
  const model = ctx.valueCardModel({ last_30: { emails: 9999999 } }, 'last_30');
  const link = ctx.valueShareLink('x', 'A'.repeat(24));
  const { text } = ctx.valueShareText('x', model, link);
  assert.ok(text.length <= 280, `X post is ${text.length} characters`);
});

// ---------------------------------------------------------------------------
// 5. Where each button goes
// ---------------------------------------------------------------------------

test('each composer opens prefilled, and Slack falls through to the clipboard', () => {
  const ctx = context();
  const text = 'hello & goodbye';
  const subject = 'subj';

  assert.match(ctx.shareIntentUrl('x', subject, text, 'l'), /^https:\/\/twitter\.com\/intent\/tweet\?text=/);
  assert.match(ctx.shareIntentUrl('linkedin', subject, text, 'l'), /linkedin\.com\/feed\/\?shareActive=true&text=/);
  assert.match(ctx.shareIntentUrl('email', subject, text, 'l'), /^mailto:\?subject=subj&body=/);

  // Ampersands in the caption must not truncate the composer's own query string.
  for (const n of ['x', 'linkedin', 'email']) {
    assert.ok(ctx.shareIntentUrl(n, subject, text, 'l').includes('hello%20%26%20goodbye'));
  }

  assert.strictEqual(ctx.shareIntentUrl('slack', subject, text, 'l'), null,
    'Slack has no web composer — the caller has to use the clipboard');
});

test('the download is named for the range it shows', () => {
  const ctx = context();
  assert.strictEqual(ctx.shareCardFilename(ctx.valueCardModel(REAL, 'last_30')),
    'linkfinder-ai-last-30-days.png');
  assert.strictEqual(ctx.shareCardFilename(ctx.valueCardModel(REAL, 'all_time')),
    'linkfinder-ai-all-time.png');
});

// ---------------------------------------------------------------------------
// 6. What the modal promises
// ---------------------------------------------------------------------------

test('the modal states the privacy of the card either way', () => {
  const ctx = context();
  for (const code of ['ELIAS42', '']) {
    assert.match(ctx.shareFootText(code), /no names, no emails/);
  }
});

test('the commission is only promised when there is a code to earn it', () => {
  const ctx = context();
  assert.match(ctx.shareFootText('ELIAS42'), /25%/);
  assert.doesNotMatch(ctx.shareFootText(''), /25%/,
    'a user with no referral code must not be told they earn commission');
});

test('the modal does not claim the link is printed on the image', () => {
  const ctx = context();
  // The card paints linkfinderai.com; the referral link lives in the post text.
  // Both are on screen together, so a wrong claim here is visible immediately.
  assert.doesNotMatch(ctx.shareFootText('ELIAS42'), /card carries your referral/i);
  assert.match(ctx.shareFootText('ELIAS42'), /post text/i);
});

// ---------------------------------------------------------------------------
// 7. The buttons the page actually wires up
// ---------------------------------------------------------------------------

test('every share button in the markup calls a function the page exports', () => {
  const modal = page.slice(page.indexOf('<!-- Share Modal -->'), page.indexOf('<!-- Pricing Modal -->'));
  const handlers = [...modal.matchAll(/onclick="(\w+)\(/g)].map((m) => m[1]);
  assert.ok(handlers.length >= 7, `only found ${handlers.length} share handlers`);
  for (const fn of new Set(handlers)) {
    assert.ok(page.includes(`window.${fn} = ${fn};`),
      `${fn}() is wired to a button but never put on window — inline onclick cannot reach it`);
  }
});

test('the X button does not rely on an icon this site’s Font Awesome lacks', () => {
  // fa-x-twitter landed in 6.4.2; every page here loads 6.4.0.
  assert.match(page, /font-awesome\/6\.4\.0/);
  assert.doesNotMatch(page, /class="[^"]*fa-x-twitter/,
    'fa-x-twitter renders as an empty box on 6.4.0');
  const modal = page.slice(page.indexOf('<!-- Share Modal -->'), page.indexOf('<!-- Pricing Modal -->'));
  assert.match(modal, /<svg[^>]*viewBox="0 0 24 24"/, 'the X mark has to be inlined instead');
});
