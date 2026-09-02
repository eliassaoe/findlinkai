/* Unlimited Leads — customer app.
 *
 * Four screens: sign in, the brief, the dashboard, one campaign.
 * It knows nothing about Explee. Every call goes to the tenant API, which holds
 * the key and refuses any campaign the signed-in user does not own — so a bug
 * in here cannot show one customer another's inbox.
 */
const CFG = window.UL_CONFIG || {};
const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const when = (iso) => {
  if (!iso) return '';
  const d = new Date(iso), mins = (Date.now() - d) / 6e4;
  if (mins < 1) return 'just now';
  if (mins < 60) return `${Math.floor(mins)}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  if (mins < 10080) return `${Math.floor(mins / 1440)}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/* ---------------------------------------------------------------- transport */
let session = null;

async function api(path, opts = {}) {
  if (!session) throw new Error('Signed out.');
  const r = await fetch(CFG.API_BASE + path, {
    ...opts,
    headers: {
      authorization: `Bearer ${session.access_token}`,
      'content-type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Something went wrong (${r.status}).`);
  return data;
}

/* ------------------------------------------------------------------ screens */

function screenSignIn(notice) {
  app.innerHTML = `
    <div class="card" style="max-width:26rem;margin:3rem auto">
      <h1>Booked calls, done for you</h1>
      <p class="hint" style="margin:.5rem 0 1.25rem;font-size:.9rem;line-height:1.6">
        Tell us who you sell to. We find them, write to them, and the replies
        land here. You show up to the calls.
      </p>
      ${notice ? `<div class="err">${esc(notice)}</div>` : ''}
      <form id="f" class="stack" style="gap:.75rem">
        <div>
          <label for="email">Work email</label>
          <input id="email" type="email" required autocomplete="email" placeholder="you@company.com">
        </div>
        <button class="btn" type="submit">Email me a sign-in link</button>
        <p class="hint">No password. We send a link that signs you straight in.</p>
      </form>
    </div>`;

  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('#f button'); btn.disabled = true; btn.textContent = 'Sending…';
    const { error } = await sb.auth.signInWithOtp({
      email: $('#email').value.trim(),
      options: { emailRedirectTo: location.origin + location.pathname },
    });
    if (error) { screenSignIn(error.message); return; }
    app.innerHTML = `
      <div class="card" style="max-width:26rem;margin:3rem auto;text-align:center">
        <h2>Check your email</h2>
        <p class="hint" style="margin-top:.5rem">
          We sent a sign-in link to <strong>${esc($('#email')?.value || 'your inbox')}</strong>.
          It works once and expires in an hour.
        </p>
      </div>`;
  };
}

function screenBrief(prefill = {}) {
  app.innerHTML = `
    <div style="max-width:38rem;margin:0 auto">
      <h1>Tell us who to write to</h1>
      <p class="hint" style="margin:.4rem 0 1.5rem;font-size:.9rem;line-height:1.6">
        This is the whole setup. Once you send it we build your campaign and
        start finding people — you don't connect a mailbox or upload a list.
      </p>
      <form id="f" class="stack">
        <div class="card stack">
          <div>
            <label for="company">Your company</label>
            <input id="company" required placeholder="Acme Analytics" value="${esc(prefill.company || '')}">
          </div>
          <div>
            <label for="offer">What do you sell, and to whom?</label>
            <textarea id="offer" required minlength="20"
              placeholder="We sell a revenue-attribution tool to B2B SaaS companies doing $2-20M ARR. Marketing teams use it to prove which campaigns produce pipeline."></textarea>
            <p class="hint">Write it as you would explain it on a call. This becomes the campaign brief.</p>
          </div>
          <div>
            <label for="problem">What problem does it solve for them?</label>
            <textarea id="problem" placeholder="They cannot tell which channels actually produce revenue, so budget decisions are guesswork."></textarea>
          </div>
        </div>

        <div class="card stack">
          <h3>Who should we contact?</h3>
          <div class="grid2">
            <div>
              <label for="role">Job titles</label>
              <input id="role" placeholder="Head of Marketing, VP Demand Gen">
            </div>
            <div>
              <label for="geo">Where</label>
              <input id="geo" placeholder="France, Benelux">
            </div>
            <div>
              <label for="size">Company size</label>
              <input id="size" placeholder="50–500 employees">
            </div>
            <div>
              <label for="lang">Language of the emails</label>
              <select id="lang">
                <option value="en">English</option>
                <option value="fr">French</option>
                <option value="es">Spanish</option>
                <option value="de">German</option>
                <option value="nl">Dutch</option>
                <option value="it">Italian</option>
              </select>
            </div>
          </div>
        </div>

        <div class="card stack">
          <h3>How it should sound</h3>
          <div>
            <label for="instructions">Anything the first email must say or avoid</label>
            <textarea id="instructions" placeholder="Mention we integrate with HubSpot. Never claim a specific ROI number. Keep it under 80 words."></textarea>
            <p class="hint">Optional. Leave it blank and we write from your description.</p>
          </div>
          <div>
            <label for="calendly">Your booking link</label>
            <input id="calendly" type="url" placeholder="https://calendly.com/you/30min"
              value="${esc(prefill.calendly_url || '')}">
            <p class="hint">
              This goes in your emails, and only yours. Meetings land on your calendar.
            </p>
          </div>
        </div>

        <div id="e"></div>
        <button class="btn" type="submit" style="justify-self:start">Start my campaign</button>
      </form>
    </div>`;

  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('#f button[type=submit]');
    btn.disabled = true; btn.textContent = 'Setting up…';
    try {
      await api('/api/onboarding', { method: 'POST', body: JSON.stringify({
        company: $('#company').value.trim(),
        offer: $('#offer').value.trim(),
        customer_problem: $('#problem').value.trim() || null,
        target_role: $('#role').value.trim() || null,
        target_geography: $('#geo').value.trim() || null,
        target_company_size: $('#size').value.trim() || null,
        instructions: $('#instructions').value.trim() || null,
        language: $('#lang').value,
        calendly_url: $('#calendly').value.trim() || null,
      })});
      await route();
    } catch (err) {
      $('#e').innerHTML = `<div class="err">${esc(err.message)}</div>`;
      btn.disabled = false; btn.textContent = 'Start my campaign';
    }
  };
}

const pillFor = (c) => c.status === 'active'
  ? `<span class="pill live"><i class="dot"></i>${esc(c.label)}</span>`
  : (c.status === 'pending_setup' || c.status === 'waiting_leads')
    ? `<span class="pill wait"><i class="dot pulse"></i>${esc(c.label)}</span>`
    : `<span class="pill off"><i class="dot"></i>${esc(c.label)}</span>`;

function screenDashboard(me) {
  app.innerHTML = `
    <div class="stack">
      <div>
        <h1>Your campaigns</h1>
        <p class="hint">${esc(me.company || me.email)}</p>
      </div>
      ${me.campaigns.map(c => `
        <button class="card" data-id="${esc(c.id)}" style="display:block;width:100%;text-align:left;border-width:1px">
          <div style="display:flex;align-items:center;gap:.75rem">
            <h2 style="flex:1">${esc(c.name)}</h2>${pillFor(c)}
          </div>
          <p class="hint" style="margin-top:.45rem;font-size:.86rem">${esc(c.note)}</p>
          ${c.has_data ? `<div class="stats" data-stats="${esc(c.id)}" style="margin-top:.9rem">
            <div class="stat"><b class="skel" style="width:2rem">&nbsp;</b><small>Contacted</small></div>
            <div class="stat"><b class="skel" style="width:2rem">&nbsp;</b><small>Replies</small></div>
            <div class="stat"><b class="skel" style="width:2rem">&nbsp;</b><small>Interested</small></div>
            <div class="stat hi"><b class="skel" style="width:2rem">&nbsp;</b><small>Calls booked</small></div>
          </div>` : ''}
        </button>`).join('')}
    </div>`;

  app.querySelectorAll('[data-id]').forEach(el => {
    el.onclick = () => screenCampaign(el.dataset.id);
  });

  // Stats load per card, so one slow campaign never blocks the page.
  me.campaigns.filter(c => c.has_data).forEach(async (c) => {
    try {
      const a = await api(`/api/campaigns/${c.id}/analytics?period=all`);
      const host = app.querySelector(`[data-stats="${c.id}"]`);
      if (!host) return;
      const cells = [
        ['Contacted', a.emails_sent ?? a.sent ?? 0, ''],
        ['Replies', a.replies ?? 0, ''],
        ['Interested', a.hot_leads ?? a.interested ?? 0, ''],
        ['Calls booked', a.booked ?? 0, 'hi'],
      ];
      host.innerHTML = cells.map(([label, v, cls]) =>
        `<div class="stat ${cls}"><b>${esc(v)}</b><small>${label}</small></div>`).join('');
    } catch { /* a stat that will not load is not worth an error banner */ }
  });
}

async function screenCampaign(id) {
  app.innerHTML = `<div class="card"><div class="skel" style="width:35%"></div></div>`;
  let c;
  try { c = await api(`/api/campaigns/${id}`); }
  catch (e) { app.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }

  app.innerHTML = `
    <button id="back" class="btn ghost" style="padding:.3rem .65rem;font-size:.82rem;margin-bottom:1rem">← All campaigns</button>
    <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.35rem">
      <h1 style="flex:1">${esc(c.name)}</h1>${pillFor(c)}
    </div>
    <p class="hint" style="margin-bottom:1.4rem">${esc(c.note)}</p>
    <div id="body"></div>`;
  $('#back').onclick = route;

  const body = $('#body');
  if (!c.has_data) {
    body.innerHTML = `
      <div class="card empty">
        <h3>${esc(c.label)}</h3>
        <p>${esc(c.note)} We'll email you the moment the first reply arrives —
        there's nothing for you to do until then.</p>
      </div>`;
    return;
  }

  body.innerHTML = `
    <div class="tabs" role="tablist">
      <button class="tab" role="tab" data-tab="need_reply" aria-selected="true">Needs reply</button>
      <button class="tab" role="tab" data-tab="replied" aria-selected="false">All replies</button>
      <button class="tab" role="tab" data-tab="sent" aria-selected="false">People contacted</button>
    </div>
    <div id="list"></div>`;

  const tabs = body.querySelectorAll('.tab');
  tabs.forEach(t => t.onclick = () => {
    tabs.forEach(x => x.setAttribute('aria-selected', String(x === t)));
    loadList(id, t.dataset.tab);
  });
  loadList(id, 'need_reply');
}

const EMPTY = {
  need_reply: ['Nothing waiting on you', 'When someone replies with interest, they appear here first. Answering within a day is what turns a reply into a call.'],
  replied: ['No replies yet', 'Replies show up here as they come in. The first ones usually take a few days after sending starts.'],
  sent: ['Nobody contacted yet', 'The people we write to will be listed here, newest first.'],
};

async function loadList(id, tab) {
  const list = $('#list');
  list.innerHTML = `<div class="rows">${'<div class="row"><div><div class="skel" style="width:9rem"></div></div></div>'.repeat(3)}</div>`;
  let data;
  try {
    const path = tab === 'sent' ? `/api/campaigns/${id}/leads` : `/api/campaigns/${id}/inbox?tab=${tab}`;
    data = await api(path);
  } catch (e) { list.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }

  const people = data.conversations || data.people || data.leads || [];
  if (!people.length) {
    const [h, p] = EMPTY[tab];
    list.innerHTML = `<div class="card empty"><h3>${h}</h3><p>${p}</p></div>`;
    return;
  }

  list.innerHTML = `<div class="rows">${people.map(p => {
    const pid = p.person_id ?? p.id ?? '';
    const name = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || 'Unknown';
    const meta = [p.job_title || p.title, p.company_name || p.company].filter(Boolean).join(' · ')
      || p.email || '';
    const snip = p.last_message || p.snippet || '';
    return `<button class="row" data-p="${esc(pid)}" ${tab === 'sent' ? 'disabled style="cursor:default"' : ''}>
        <div style="min-width:0">
          <div class="who">${esc(name)}</div>
          <div class="meta">${esc(snip || meta)}</div>
        </div>
        <div style="text-align:right;white-space:nowrap">
          ${p.is_hot || p.hot ? '<span class="pill live" style="margin-bottom:.2rem">Interested</span><br>' : ''}
          <small class="hint">${esc(when(p.last_message_at || p.replied_at || p.contacted_at || p.created_at))}</small>
        </div>
      </button>`;
  }).join('')}</div>`;

  list.querySelectorAll('.row[data-p]:not([disabled])').forEach(el => {
    el.onclick = () => screenThread(id, el.dataset.p);
  });
}

async function screenThread(id, personId) {
  const list = $('#list');
  list.innerHTML = `<div class="card"><div class="skel" style="width:45%"></div></div>`;
  let t;
  try { t = await api(`/api/campaigns/${id}/threads/${encodeURIComponent(personId)}`); }
  catch (e) { list.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }

  const person = t.person || t.lead || {};
  const msgs = t.messages || t.thread || [];
  const canReply = t.can_reply !== false;

  list.innerHTML = `
    <div class="card stack">
      <div style="display:flex;align-items:center;gap:.6rem">
        <button id="b2" class="btn ghost" style="padding:.25rem .6rem;font-size:.8rem">←</button>
        <div style="flex:1;min-width:0">
          <h3>${esc(person.full_name || person.email || 'Conversation')}</h3>
          <p class="hint" style="margin:0">${esc([person.job_title, person.company_name].filter(Boolean).join(' · '))}</p>
        </div>
      </div>
      <div class="thread">${msgs.map(m => {
        const inbound = m.direction === 'inbound' || m.is_reply || m.from_lead;
        return `<div class="msg ${inbound ? 'in' : ''}">
            <div class="from">${inbound ? esc(person.full_name || 'Them') : 'You'} · ${esc(when(m.sent_at || m.created_at))}</div>
            <p>${esc(m.body || m.content || m.text || '')}</p>
          </div>`;
      }).join('') || '<p class="hint">No messages yet.</p>'}</div>
      ${canReply ? `
        <form id="r" class="stack" style="gap:.5rem">
          <label for="msg">Your reply</label>
          <textarea id="msg" required placeholder="Thanks for getting back to me — does Tuesday 10:00 or Wednesday 14:00 suit you better?"></textarea>
          <p class="hint">Proposing two specific times books far more calls than sending a link.</p>
          <div id="re"></div>
          <button class="btn" type="submit" style="justify-self:start">Send reply</button>
        </form>` : `<p class="hint">This conversation is closed — they asked not to be contacted again.</p>`}
    </div>`;

  $('#b2').onclick = () => loadList(id, 'need_reply');
  const form = $('#r');
  if (form) form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      await api(`/api/campaigns/${id}/threads/${encodeURIComponent(personId)}/reply`,
        { method: 'POST', body: JSON.stringify({ message: $('#msg').value }) });
      await screenThread(id, personId);
    } catch (err) {
      $('#re').innerHTML = `<div class="err">${esc(err.message)}</div>`;
      btn.disabled = false; btn.textContent = 'Send reply';
    }
  };
}

/* -------------------------------------------------------------------- route */
async function route() {
  if (!session) { $('#who').textContent = ''; $('#signout').classList.add('hidden'); return screenSignIn(); }
  $('#signout').classList.remove('hidden');
  let me;
  try { me = await api('/api/me'); }
  catch (e) { app.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
  $('#who').textContent = me.email;
  if (!me.onboarded || !me.campaigns.length) return screenBrief(me);
  screenDashboard(me);
}

$('#signout').onclick = async () => { await sb.auth.signOut(); location.reload(); };

sb.auth.getSession().then(({ data }) => { session = data.session; route(); });
sb.auth.onAuthStateChange((_e, s) => {
  const had = !!session; session = s;
  if (!!s !== had) route();
});
