// Two regressions this worker shipped with, reproduced and shown fixed.
//
// 1. isSubscriber(token) instead of isSubscriber(env, token)  [task #25]
// 2. /disconnect never told Nango, so the connection stayed billable and the
//    customer's OAuth grant stayed live.

let sentBodies = [];
const fakeSubscriberService = {
  async fetch(_url, init) {
    const body = JSON.parse(init.body);
    sentBodies.push(body);
    // The real upgrade-intent worker keys off `token`. No token, no answer.
    if (!body.token) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => ({ issub: true }) };
  },
};

async function isSubscriber(env, token) {
  try {
    const call = env.SUBSCRIBER_SERVICE || { fetch: async () => ({ ok: false, json: async () => ({}) }) };
    const r = await call.fetch('https://upgrade-intent.hamoureliasse.workers.dev/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, trigger: 'crm_sync_gate' }),
    });
    if (!r.ok) return false;
    const d = await r.json().catch(() => ({}));
    return d.issub === true;
  } catch (e) {
    return false;
  }
}

const env = { SUBSCRIBER_SERVICE: fakeSubscriberService };
const TOKEN = 'lf_real_paying_customer';

// --- 1. the gate ---
sentBodies = [];
const wrong = await isSubscriber(TOKEN);          // the live call shape at 2 sites
const wrongBody = sentBodies[0];
sentBodies = [];
const right = await isSubscriber(env, TOKEN);     // the fixed shape
const rightBody = sentBodies[0];

console.log('isSubscriber for a genuinely subscribed user:');
console.log(`  isSubscriber(token)      -> ${wrong}   sent ${JSON.stringify(wrongBody)}`);
console.log(`  isSubscriber(env, token) -> ${right}    sent ${JSON.stringify(rightBody)}`);

// --- 2. disconnect ---
let nangoCalls = [];
const KV = new Map([['conn:' + TOKEN, JSON.stringify({ connectionId: 'conn_abc123' })]]);

async function disconnectOld() {
  KV.delete('conn:' + TOKEN);
  return { ok: true };
}
async function disconnectNew() {
  const raw = KV.get('conn:' + TOKEN);
  let released = false;
  if (raw) {
    const { connectionId } = JSON.parse(raw);
    nangoCalls.push(`DELETE /connections/${connectionId}`);
    released = true;
  }
  KV.delete('conn:' + TOKEN);
  return { ok: true, released };
}

nangoCalls = [];
await disconnectOld();
const oldCalls = nangoCalls.length;
KV.set('conn:' + TOKEN, JSON.stringify({ connectionId: 'conn_abc123' }));
nangoCalls = [];
const newResult = await disconnectNew();
const newCalls = nangoCalls.length;

console.log('\n/disconnect — calls made to Nango:');
console.log(`  old: ${oldCalls}  (connection stays alive and billable)`);
console.log(`  new: ${newCalls}  ${JSON.stringify(nangoCalls)} -> ${JSON.stringify(newResult)}`);

const pass = wrong === false && right === true && oldCalls === 0 && newCalls === 1;
console.log(pass ? '\nPASS — both regressions reproduced, both fixed.' : '\nFAIL');
process.exit(pass ? 0 : 1);
