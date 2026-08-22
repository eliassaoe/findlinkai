const mod = await import('/home/user/findlinkai/workers/verify-email/worker.js');
const kv = new Map();
const env = { SUPABASE_URL:'https://sb.test', SUPABASE_SERVICE_KEY:'svc', VERIFY_CAP:'10',
  VERIFY_HELD_FALLBACK:'0',
  RATE_LIMITS: { get:async k=>kv.has(k)?kv.get(k):null, delete:async k=>{kv.delete(k)}, put:async(k,v)=>{kv.set(k,v)} } };

let db, calls;
function install(){
  calls = [];
  globalThis.fetch = async (url, opts={}) => {
    calls.push([opts.method||'GET', url, opts.body ? JSON.parse(opts.body) : null]);
    // Must be method-guarded: a PATCH hits the same path as the SELECT, and an
    // unguarded match here swallows the write and makes a broken worker look fine.
    if ((opts.method||'GET') === 'GET' && url.includes('/rest/v1/linkfinderai_users?token=eq.')) {
      const t = decodeURIComponent(url.split('token=eq.')[1].split('&')[0]);
      return { ok:true, status:200, json: async()=> db.rows.filter(r=>r.token===t) };
    }
    if (url.includes('/rest/v1/rpc/email_is_confirmed')) {
      const { p_email } = JSON.parse(opts.body);
      const r = db.rows.find(x=>String(x.email).toLowerCase()===String(p_email).toLowerCase());
      return { ok:true, status:200, json: async()=> Boolean(r && r.confirmed), text: async()=>'' };
    }
    if (url.includes('/auth/v1/resend')) return { ok: db.resendOk!==false, status: db.resendStatus||200, text: async()=>'' };
    if (opts.method === 'PATCH') {
      // No `id` column exists - the worker must filter on token or write nothing.
      if (!url.includes('token=eq.')) throw new Error('PATCH must key on token, got: '+url);
      const tok = decodeURIComponent(url.split('token=eq.')[1]);
      const row = db.rows.find(r=>r.token===tok);
      if (!row) throw new Error('PATCH matched no row for token '+tok);
      Object.assign(row, JSON.parse(opts.body));
      return { ok:true, status:200, text: async()=>'' };
    }
    throw new Error('unmocked '+url);
  };
}
const post = (route, body) => mod.default.fetch(new Request('https://w.dev/'+route, {
  method:'POST', headers:{'Content-Type':'application/json','Origin':'https://linkfinderai.com'}, body: JSON.stringify(body)
}), env);

// Shaped like the real linkfinderai_users: no id, no auth_id.
function fresh(){ db = { rows:[
  { token:'tok_unverified',  email:'x@y.com', credits:10,  email_verified:false, confirmed:false },
  { token:'tok_google',      email:'g@y.com', credits:150, email_verified:true,  confirmed:true  },
  { token:'tok_justclicked', email:'j@y.com', credits:10,  email_verified:false, confirmed:true  },
]};
  kv.clear();
  kv.set('held_x@y.com','140');    // standard tier: 150 granted, 10 given, 140 held
  kv.set('held_j@y.com','15');     // low-conversion tier: 25 granted, 10 given, 15 held
  install(); }

fresh();
let r = await post('status',{token:'tok_unverified'}); let j = await r.json();
console.assert(j.email_verified===false && j.verify_cap===10 && j.credits_pending===140, JSON.stringify(j));
console.log('1 status unverified   ->', JSON.stringify(j));

r = await post('status',{token:'tok_google'}); j = await r.json();
console.assert(j.email_verified===true && j.credits_pending===0, JSON.stringify(j));
console.log('2 status google       ->', JSON.stringify(j));

r = await post('claim',{token:'tok_unverified'}); j = await r.json();
console.assert(j.ok===false && j.email_verified===false, JSON.stringify(j));
console.assert(db.rows[0].credits===10, 'must NOT top up before Supabase confirms');
console.log('3 claim, not confirmed-> refused, credits untouched');

r = await post('claim',{token:'tok_justclicked'}); j = await r.json();
console.assert(j.ok && j.credits_added===15, JSON.stringify(j));
console.assert(db.rows[2].credits===25 && db.rows[2].email_verified===true, JSON.stringify(db.rows[2]));
console.assert(!('id' in db.rows[2]), 'test fixture must not carry an id the real table lacks');
console.log('4 claim, confirmed    -> low-conversion tier topped up to', db.rows[2].credits, '(25, not 100)');

r = await post('claim',{token:'tok_justclicked'}); j = await r.json();
console.assert(j.credits_added===0, JSON.stringify(j));
console.assert(db.rows[2].credits===25, 'DOUBLE TOP-UP: credits are now '+db.rows[2].credits);
console.log('5 claim again         -> idempotent, still', db.rows[2].credits);
console.assert(!kv.has('held_j@y.com'), 'stash should be burned after a successful claim');
console.log('5b stash burned       -> yes');

// A pre-existing account has no stash. It must add nothing, never guess.
fresh(); kv.delete('held_j@y.com');
r = await post('claim',{token:'tok_justclicked'}); j = await r.json();
console.assert(j.ok && j.credits_added===0, JSON.stringify(j));
console.assert(db.rows[2].credits===10, 'must not invent credits: '+db.rows[2].credits);
console.log('5c no stash (legacy)  -> verified, 0 credits invented');

// Gmail dots/plus must resolve to the same key the signup worker wrote.
fresh();
db.rows[0].email='X.Y+promo@Gmail.com'; kv.clear(); kv.set('held_xy@gmail.com','140');
r = await post('status',{token:'tok_unverified'}); j = await r.json();
console.assert(j.credits_pending===140, 'gmail normalization mismatch: '+JSON.stringify(j));
console.log('5d gmail normalized   -> X.Y+promo@Gmail.com finds held_xy@gmail.com');

r = await post('resend',{token:'tok_google'}); j = await r.json();
console.assert(j.already_verified===true, JSON.stringify(j));
console.assert(!calls.some(c=>String(c[1]).includes('/auth/v1/resend')), 'must not email a verified user');
console.log('6 resend to verified  -> no email sent');

fresh(); db.resendStatus=429; db.resendOk=false;
r = await post('resend',{token:'tok_unverified'}); j = await r.json();
console.assert(j.rate_limited===true, JSON.stringify(j));
console.log('7 supabase 429        -> surfaced as rate_limited, not an error');

fresh();
r = await post('status',{token:'nope'});
console.assert(r.status===401, r.status);
console.log('8 unknown token       -> 401');

fresh();
r = await mod.default.fetch(new Request('https://w.dev/status',{method:'GET'}), env);
console.assert(r.status===405, r.status);
console.log('9 GET                 -> 405');

// the column-missing safety: a row with no email_verified column at all
fresh(); delete db.rows[0].email_verified;
r = await post('status',{token:'tok_unverified'}); j = await r.json();
console.assert(j.email_verified===false, 'missing column must not read as verified');
console.log('10 column absent      -> treated as unverified, not verified');

// CORS must not reflect an arbitrary origin
fresh();
r = await mod.default.fetch(new Request('https://w.dev/status',{method:'OPTIONS',headers:{'Origin':'https://evil.example'}}), env);
console.assert(r.headers.get('Access-Control-Allow-Origin')==='https://linkfinderai.com', r.headers.get('Access-Control-Allow-Origin'));
console.log('11 foreign origin     -> not reflected');

console.log('\nall worker cases pass');
