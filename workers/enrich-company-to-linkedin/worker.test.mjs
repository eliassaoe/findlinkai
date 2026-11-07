// Cases are real rows from enrichment_history (7 Nov 2026, docs/find-rate.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const m = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'worker.js')).href);
const { parseCompany, nameMatches, pickFromGoogle, pickFromLinkedInSearch, buildQueries } = m;
const g = (title, link) => ({ title, link });

test('legal suffixes and country codes are not part of the name', () => {
  assert.deepEqual(parseCompany('Nihon Yamamura Glass Co. Ltd').tokens, ['nihon', 'yamamura', 'glass']);
  assert.deepEqual(parseCompany('D.R. FERROVIARIA ITALIA SRL').tokens, ['d', 'r', 'ferroviaria', 'italia']);
  assert.deepEqual(parseCompany('AB InBev').tokens, ['ab', 'inbev'], 'a first word is never dropped');
});

test('a domain is recognised and searched as a domain', () => {
  const p = parseCompany('https://www.stripe.com/');
  assert.equal(p.domain, 'stripe.com');
  assert.equal(buildQueries(p)[0], '"stripe.com" site:linkedin.com/company');
  assert.equal(parseCompany('cigar-volume.myshopify.com').tokens[0], 'cigar-volume');
});

test("Google's first result is rejected when it is another company", () => {
  const p = parseCompany('Nihon Yamamura Glass Co. Ltd');
  const organic = [
    g('San Miguel Yamamura Australasia Group | LinkedIn', 'https://au.linkedin.com/company/san-miguel-yamamura-australasia-group'),
    g('Nihon Yamamura Glass Co Ltd | LinkedIn', 'https://www.linkedin.com/company/nihon-yamamura-glass-co-ltd/')
  ];
  assert.equal(pickFromGoogle(p, organic).link, 'https://www.linkedin.com/company/nihon-yamamura-glass-co-ltd/');
});

test('known wrong matches from the history are refused', () => {
  assert.equal(pickFromGoogle(parseCompany('Krause Rail Systems'), [g('SRS Rail System International Ltd | LinkedIn', 'https://www.linkedin.com/company/srs-rail-system-international-ltd/')]), null);
  assert.equal(pickFromGoogle(parseCompany('Federal Agricultural Mortgage Corporation'), [g('American Farm Mortgage Co Inc | LinkedIn', 'https://www.linkedin.com/company/american-farm-mortage-co-inc')]), null);
  assert.equal(pickFromGoogle(parseCompany('Metatronix Srl'), [g('Meta-Tronix Pvt Ltd | LinkedIn', 'https://www.linkedin.com/company/meta-tronix-pvt-ltd/')]), null);
});

test('legal forms from two countries mean two companies; shared or absent forms do not block', () => {
  assert.equal(nameMatches(parseCompany('Metatronix Srl'), 'Meta-Tronix Pvt Ltd'), false);
  assert.equal(nameMatches(parseCompany('D.R. Ferroviaria Italia SRL'), 'D.R. Ferroviaria Italia Srl'), true);
  assert.equal(nameMatches(parseCompany('Nihon Yamamura Glass Co. Ltd'), 'Nihon Yamamura Glass Co Ltd'), true);
  assert.equal(nameMatches(parseCompany('Stripe Inc'), 'Stripe'), true);
  assert.equal(nameMatches(parseCompany('EMES Holding GmbH'), 'EMES AG'), true, 'GmbH and AG are both German-speaking');
});

test('right pages with a different slug still match', () => {
  assert.ok(pickFromGoogle(parseCompany('Connected Places Catapult'), [g('Connected Places Catapult | LinkedIn', 'https://www.linkedin.com/company/cpcatapult/')]));
  assert.ok(pickFromGoogle(parseCompany('Stripe'), [g('Stripe | LinkedIn', 'https://www.linkedin.com/company/stripe/')]));
  assert.ok(pickFromGoogle(parseCompany('3A Composites GmbH'), [g('3A Composites | LinkedIn', 'https://www.linkedin.com/company/3ac-composites/')]));
});

test('people, posts and showcase pages are never returned', () => {
  assert.equal(pickFromGoogle(parseCompany('Stripe'), [g('Stripe - Jane Doe | LinkedIn', 'https://www.linkedin.com/in/jane'), g('Stripe on LinkedIn', 'https://www.linkedin.com/posts/stripe_x')]), null);
});

test('LinkedIn search: accept a matching name, or the same website for a domain', () => {
  const rows = [{ name: 'D.R. Ferroviaria Italia Srl', linkedinUrl: 'https://www.linkedin.com/company/dr-ferroviaria-italia/', website: 'http://drferroviariaitalia.com' }];
  assert.equal(pickFromLinkedInSearch(parseCompany('D.R. FERROVIARIA ITALIA SRL'), rows).link, 'https://www.linkedin.com/company/dr-ferroviaria-italia/');
  assert.ok(pickFromLinkedInSearch(parseCompany('drferroviariaitalia.com'), rows));
  assert.equal(pickFromLinkedInSearch(parseCompany('otherdomain.com'), rows), null);
});

const post = (body, key) => new Request('https://w.test/', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { 'X-Worker-Key': key } : {}) }, body: JSON.stringify(body) });
const ENV = { SERPER_API_KEY: 'k', N8N_SHARED_SECRET: 's3cret' };

test('refuses any request without the shared secret', async () => {
  assert.equal((await m.default.fetch(post({ input_data: 'Stripe' }), ENV)).status, 403);
  assert.equal((await m.default.fetch(post({ input_data: 'Stripe' }, 'guess'), ENV)).status, 403);
  assert.equal((await m.default.fetch(post({ input_data: 'Stripe' }, 's3cret'), { SERPER_API_KEY: 'k' })).status, 403, 'no secret configured');
});

test('Google miss -> LinkedIn company search, only with a token', async () => {
  let apify = 0;
  globalThis.fetch = async (url) => {
    if (String(url).includes('serper.dev')) return { ok: true, status: 200, json: async () => ({ organic: [] }) };
    apify++;
    return { ok: true, status: 200, json: async () => [{ name: 'Shandong Huasheng Zhongtian Engineering Machinery Co,Ltd', linkedinUrl: 'https://www.linkedin.com/company/shandong-huasheng-zhongtian-engineering-machinery-co-ltd/', website: 'http://www.htgc.cn' }] };
  };
  const input = { input_data: 'SHANDONG HUASHENG ZHONGTIAN ENGINEERING MACHINERY CO., LTD' };
  let out = await (await m.default.fetch(post(input, 's3cret'), { ...ENV, APIFY_TOKEN: 't' })).json();
  assert.equal(out.result, 'https://www.linkedin.com/company/shandong-huasheng-zhongtian-engineering-machinery-co-ltd/');
  assert.equal(out.source, 'linkedin_search');
  out = await (await m.default.fetch(post(input, 's3cret'), ENV)).json();
  assert.equal(out.result, '');
  assert.equal(apify, 1);
});

test('a Serper outage is a 502, not a false not-found', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  assert.equal((await m.default.fetch(post({ input_data: 'Stripe' }, 's3cret'), ENV)).status, 502);
});
