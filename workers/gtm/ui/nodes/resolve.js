// Turn profiles into addresses. LinkFinder: 10 credits from a LinkedIn URL, 7
// from name + company, charged whether or not one comes back. Leads that
// already carry an email are never looked up.
//
// n8n kills a Code node at 300s (N8N_RUNNERS_TASK_TIMEOUT). A serial loop over
// 47 leads with a 1.1s spacer and an occasional 8s job poll blows that easily,
// so this works to a wall-clock budget with a few lookups in flight at once,
// and returns what it has when the budget runs out rather than dying with
// nothing. Raising the cap or the concurrency past the plan's requests/second
// is how you trade credits for 429s — the defaults sit under Starter's 5/s.
const cfg = $('Config').first().json;
const leads = $input.all().map(i => i.json);
const canHttp = !!(this.helpers && this.helpers.httpRequest);
const http = opts => this.helpers.httpRequest(opts);
const sendable = () => leads.filter(l => l.email).map(json => ({ json }));

if (!canHttp || !cfg.linkfinder_key || cfg.linkfinder_key.startsWith('PUT_')) {
  return sendable();
}

const auth = { Authorization: 'Bearer ' + cfg.linkfinder_key };
const API = 'https://api.linkfinderai.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const deadline = Date.now() + (Number(cfg.linkfinder_budget_seconds) || 240) * 1000;
const left = () => deadline - Date.now();

// Only the leads that need a lookup and give us something to look up by.
const queue = [];
for (const lead of leads) {
  if (lead.email) continue;
  const op = lead.linkedin_url
    ? { type: 'linkedin_profile_to_email', input_data: lead.linkedin_url }
    : { type: 'lead_full_name_to_email', input_data:
        [lead.full_name || lead.name, lead.company_name || lead.company]
          .filter(Boolean).join(' ') };
  if (!op.input_data) continue;
  queue.push({ lead, op });
}
const budget = queue.splice(Number(cfg.linkfinder_max) || 0);
const skippedByCap = budget.length;

let found = 0, spent = 0, stopped = '';
let next = 0;

async function worker() {
  while (next < queue.length && !stopped) {
    if (left() < 15000) { stopped = 'out of time'; break; }
    const { lead, op } = queue[next++];
    spent += op.type === 'linkedin_profile_to_email' ? 10 : 7;
    let r;
    try {
      r = await http({ method: 'POST', url: API, headers: auth, body: op,
                       json: true, timeout: Math.min(30000, left()) });
    } catch (e) {
      // 402 out of credits, 401 bad key, 429 too fast: stop, do not hammer.
      stopped = e.message;
      break;
    }
    // Any endpoint can hand back a job instead of a result if it runs long.
    // Poll only while there is budget to spare for it.
    for (let n = 0; r && r.job_id && !r.result && n < 3 && left() > 20000; n++) {
      await sleep(5000);
      try {
        r = await http({ method: 'GET', headers: auth, json: true,
                         url: r.poll_url || API + '/status/' + r.job_id });
      } catch (e) { r = null; }
    }
    const res = r && r.result;
    const email = typeof res === 'string' ? res : (res && res.email) || '';
    if (email) { lead.email = email; found++; }
    await sleep(1100);          // per worker, so ~concurrency requests/second
  }
}

const lanes = Math.max(1, Math.min(Number(cfg.linkfinder_concurrency) || 4, 5));
await Promise.all(Array.from({ length: lanes }, worker));

const done = sendable();
console.log('LinkFinder: ' + found + ' emails, ~' + spent + ' credits, ' +
  done.length + ' of ' + leads.length + ' sendable' +
  (skippedByCap ? '; ' + skippedByCap + ' past linkfinder_max' : '') +
  (stopped ? '; stopped early: ' + stopped : ''));
return done;
