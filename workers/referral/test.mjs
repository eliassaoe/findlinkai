// Run: node test.mjs   (from workers/referral)
//
// Exercises the money path against a stubbed Supabase and real HMAC signing.
// The properties that matter here are the anti-farming ones - a browser must
// never be able to mint a commission, a webhook retry must never pay twice,
// and a refund must claw the money back.
//
// worker.js only exports its default handler, so this builds a copy with the
// internal helpers re-exported. The copy is regenerated on every run, so it
// cannot drift from the source.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const copy = join(here, '.worker.test-copy.mjs');
writeFileSync(copy, readFileSync(join(here, 'worker.js'), 'utf8')
    + '\nexport { normaliseCode, sameDomain, randomCode, round2 };\n');
process.on('exit', () => { try { unlinkSync(copy); } catch (e) {} });

const { default: worker, normaliseCode, sameDomain, randomCode, round2 } =
    await import('./.worker.test-copy.mjs');

const results = [];
const assert = (c, m) => { if (!c) throw new Error(m); };
async function t(name, fn) { try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name + ' :: ' + e.message]); } }

// ---- Supabase stub -------------------------------------------------------
let db, calls;
function resetDb() {
  calls = [];
  db = {
    referral_partners: [{ user_id: 'partner1', code: 'abc123xy', status: 'active', payout_email: null }],
    referral_attributions: [{ referred_user_id: 'buyer1', partner_user_id: 'partner1', code: 'abc123xy', flagged_reason: null }],
    referral_commissions: [],
    referral_clicks: [],
    linkfinderai_users: [
      { token: 'partner1', email: 'p@acme.com' },
      { token: 'buyer1',   email: 'buyer@corp.com' },
    ],
  };
}
const SECRET = 'whsec_' + Buffer.from('supersecretkey0123').toString('base64');
const env = { SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_KEY: 'svc', DODO_WEBHOOK_SECRET: SECRET };

globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const table = u.pathname.split('/rest/v1/')[1];
  const method = opts.method || 'GET';
  calls.push({ table, method });
  const rows = db[table] || [];
  if (method === 'GET') {
    let out = rows;
    for (const [k, v] of u.searchParams) {
      if (k === 'select' || k === 'limit') continue;
      const [op, val] = [v.slice(0, v.indexOf('.')), v.slice(v.indexOf('.') + 1)];
      if (op === 'eq') out = out.filter(r => String(r[k]) === decodeURIComponent(val));
    }
    return new Response(JSON.stringify(out), { status: 200 });
  }
  if (method === 'POST') {
    const body = JSON.parse(opts.body);
    const ignoreDupes = (opts.headers?.Prefer || '').includes('ignore-duplicates');
    const added = [];
    for (const row of body) {
      // Emulate the UNIQUE constraint on dodo_payment_id.
      if (table === 'referral_commissions' && rows.some(r => r.dodo_payment_id === row.dodo_payment_id)) {
        if (ignoreDupes) continue;
        return new Response('duplicate', { status: 409 });
      }
      rows.push(row); added.push(row);
    }
    return new Response(JSON.stringify(added), { status: 201 });
  }
  if (method === 'PATCH') {
    const patch = JSON.parse(opts.body);
    for (const r of rows) {
      let match = true;
      for (const [k, v] of u.searchParams) {
        const op = v.slice(0, v.indexOf('.'));
        const val = decodeURIComponent(v.slice(v.indexOf('.') + 1));
        if (op === 'eq' && String(r[k]) !== val) match = false;
        if (op === 'in' && !val.replace(/[()]/g, '').split(',').includes(String(r[k]))) match = false;
        if (op === 'lt' && !(String(r[k]) < val)) match = false;
      }
      if (match) Object.assign(r, patch);
    }
    return new Response(JSON.stringify(rows), { status: 200 });
  }
  return new Response('[]', { status: 200 });
};

// ---- signed webhook helper ----------------------------------------------
// Node 22 already exposes a global Web Crypto, same as the Workers runtime.

async function signedRequest(payload, { tamper = false, staleTs = false } = {}) {
  const raw = JSON.stringify(payload);
  const id = 'msg_1';
  const ts = String(Math.floor(Date.now() / 1000) - (staleTs ? 4000 : 0));
  const keyBytes = Buffer.from(SECRET.slice(6), 'base64');
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${raw}`));
  let sig = Buffer.from(new Uint8Array(mac)).toString('base64');
  if (tamper) sig = Buffer.from('x'.repeat(32)).toString('base64').slice(0, sig.length).padEnd(sig.length, 'y');
  return new Request('https://ref.test/webhook/dodo', {
    method: 'POST',
    headers: { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': `v1,${sig}`, 'Content-Type': 'application/json' },
    body: raw,
  });
}

const payment = (over = {}) => ({
  type: 'payment.succeeded',
  data: { payment_id: 'pay_1', total_amount: 8900, currency: 'USD', customer: { email: 'buyer@corp.com' }, ...over },
});

// ---- tests ---------------------------------------------------------------
await t('code normalisation rejects junk', async () => {
  assert(normaliseCode('ABC123xy') === 'abc123xy', 'uppercase folds');
  assert(normaliseCode('  abc123xy ') === 'abc123xy', 'trims');
  assert(normaliseCode('short') === null, 'too short refused');
  assert(normaliseCode('has-dash-here') === null, 'punctuation refused');
  assert(normaliseCode('poweredbyai?utm_source=X') === null, 'v1-style junk refused');
  assert(normaliseCode('null') === null, 'the literal "null" that broke v1 is refused');
});

await t('generated codes avoid ambiguous glyphs', async () => {
  for (let i = 0; i < 200; i++) {
    const c = randomCode();
    assert(/^[a-z0-9]{10}$/.test(c), 'shape: ' + c);
    assert(!/[l1o0]/.test(c), 'ambiguous glyph in ' + c);
    assert(normaliseCode(c) === c, 'own code must pass validation');
  }
});

await t('same-domain detection ignores free providers', async () => {
  assert(sameDomain('a@acme.com', 'b@acme.com') === true, 'same company flagged');
  assert(sameDomain('a@gmail.com', 'b@gmail.com') === false, 'gmail is not a company');
  assert(sameDomain('a@acme.com', 'b@other.com') === false, 'different domains fine');
});

await t('valid webhook writes a pending commission at 25%', async () => {
  resetDb();
  const res = await worker.fetch(await signedRequest(payment()), env);
  assert(res.status === 200, 'status ' + res.status);
  const c = db.referral_commissions;
  assert(c.length === 1, 'one commission, got ' + c.length);
  assert(c[0].commission_amount === 22.25, 'amount ' + c[0].commission_amount);
  assert(c[0].gross_amount === 89, 'gross ' + c[0].gross_amount);
  assert(c[0].status === 'pending', 'status ' + c[0].status);
  assert(c[0].partner_user_id === 'partner1', 'partner');
});

await t('tampered signature is rejected and writes nothing', async () => {
  resetDb();
  const res = await worker.fetch(await signedRequest(payment(), { tamper: true }), env);
  assert(res.status === 401, 'status ' + res.status);
  assert(db.referral_commissions.length === 0, 'must not write');
});

await t('replayed old timestamp is rejected', async () => {
  resetDb();
  const res = await worker.fetch(await signedRequest(payment(), { staleTs: true }), env);
  assert(res.status === 401, 'status ' + res.status);
  assert(db.referral_commissions.length === 0, 'must not write');
});

await t('retry of the same payment does not pay twice', async () => {
  resetDb();
  await worker.fetch(await signedRequest(payment()), env);
  await worker.fetch(await signedRequest(payment()), env);
  await worker.fetch(await signedRequest(payment()), env);
  assert(db.referral_commissions.length === 1, 'got ' + db.referral_commissions.length);
});

await t('payer with no referrer produces nothing', async () => {
  resetDb();
  db.referral_attributions = [];
  await worker.fetch(await signedRequest(payment()), env);
  assert(db.referral_commissions.length === 0, 'no referrer, no commission');
});

await t('flagged attribution lands in review, never pending', async () => {
  resetDb();
  db.referral_attributions[0].flagged_reason = 'same_email_domain';
  await worker.fetch(await signedRequest(payment()), env);
  assert(db.referral_commissions[0].status === 'review', 'got ' + db.referral_commissions[0].status);
});

await t('blocked partner earns nothing', async () => {
  resetDb();
  db.referral_partners[0].status = 'blocked';
  await worker.fetch(await signedRequest(payment()), env);
  assert(db.referral_commissions.length === 0, 'blocked partner must not earn');
});

await t('refund voids the commission', async () => {
  resetDb();
  await worker.fetch(await signedRequest(payment()), env);
  assert(db.referral_commissions[0].status === 'pending', 'setup');
  const res = await worker.fetch(await signedRequest({ type: 'payment.refunded', data: { payment_id: 'pay_1' } }), env);
  assert(res.status === 200, 'status');
  assert(db.referral_commissions[0].status === 'void', 'got ' + db.referral_commissions[0].status);
});

await t('unmapped event is acknowledged, not retried', async () => {
  resetDb();
  const res = await worker.fetch(await signedRequest({ type: 'customer.created', data: {} }), env);
  assert(res.status === 200, 'must 200 so Dodo stops retrying');
  assert(db.referral_commissions.length === 0, 'writes nothing');
});

await t('renewal pays again - it is a different payment id', async () => {
  resetDb();
  await worker.fetch(await signedRequest(payment()), env);
  await worker.fetch(await signedRequest({ type: 'subscription.renewed', data: { payment_id: 'pay_2', total_amount: 8900, currency: 'USD', customer: { email: 'buyer@corp.com' } } }), env);
  assert(db.referral_commissions.length === 2, 'got ' + db.referral_commissions.length);
  assert(round2(db.referral_commissions.reduce((t, c) => t + c.commission_amount, 0)) === 44.5, 'total');
});

await t('zero-amount payment writes nothing', async () => {
  resetDb();
  await worker.fetch(await signedRequest(payment({ total_amount: 0 })), env);
  assert(db.referral_commissions.length === 0, 'no money, no commission');
});

await t('self-referral is refused at attribution time', async () => {
  resetDb();
  const res = await worker.fetch(new Request('https://ref.test/attribute', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'partner1', code: 'abc123xy' }),
  }), env);
  const body = await res.json();
  assert(body.ok === false && body.reason === 'self_referral', JSON.stringify(body));
  assert(db.referral_attributions.length === 1, 'no new attribution row');
});

await t('attribution is first-touch and immutable', async () => {
  resetDb();
  db.referral_partners.push({ user_id: 'partner2', code: 'zzz999qq', status: 'active' });
  db.linkfinderai_users.push({ token: 'partner2', email: 'p2@other.com' });
  const res = await worker.fetch(new Request('https://ref.test/attribute', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'buyer1', code: 'zzz999qq' }),
  }), env);
  const body = await res.json();
  assert(body.already === true, 'should report already attributed: ' + JSON.stringify(body));
  assert(db.referral_attributions[0].partner_user_id === 'partner1', 'must not move partner');
});

await t('browser cannot mint a commission through any endpoint', async () => {
  resetDb();
  for (const path of ['/me', '/attribute', '/payout']) {
    await worker.fetch(new Request('https://ref.test' + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'partner1', code: 'abc123xy', payout_email: 'x@y.com', commission_amount: 9999, status: 'approved' }),
    }), env).catch(() => {});
  }
  assert(db.referral_commissions.length === 0, 'no endpoint may create money');
});

await t('unauthenticated request is refused', async () => {
  resetDb();
  const res = await worker.fetch(new Request('https://ref.test/me', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'not-a-real-token' }),
  }), env);
  assert(res.status === 401, 'status ' + res.status);
});

console.log(results.map(([s, n]) => `${s}  ${n}`).join('\n'));
const failed = results.filter(r => r[0] === 'FAIL').length;
console.log(failed ? `\n${failed} FAILED` : '\nall green');
process.exit(failed ? 1 : 0);
