#!/usr/bin/env python3
"""Emit importable n8n workflows for the unlimited-leads MVP.

Design rules, and they are why this is generated rather than clicked together:

  * Every external system is a plain HTTP Request node. No vendor nodes, so a
    node typeVersion bump cannot break an import, and there is one shape to
    learn instead of six.
  * No IF / Switch / SplitInBatches nodes. Branching lives in Code nodes, which
    end a branch by returning []. Fewer schemas = fewer import surprises.
  * Anything that must be atomic (claiming a send, spending a credit) is a
    Postgres function called over PostgREST — never read-modify-write in a
    workflow. Two cron ticks overlap eventually; they must not double-send.
  * Secrets live in n8n credentials (predefined Supabase / Anthropic types),
    never in this JSON. On import n8n asks you to pick them. That is expected.
"""
import json, pathlib

OUT = pathlib.Path(__file__).parent / "n8n"; OUT.mkdir(exist_ok=True)
SB = "{{ $('Config').first().json.supabase }}"


def node(name, ntype, tv, params, pos, creds=None, on_error=None):
    n = {"parameters": params, "name": name, "type": f"n8n-nodes-base.{ntype}",
         "typeVersion": tv, "position": list(pos),
         "id": name.lower().replace(" ", "-").replace("—", "-")}
    if creds: n["credentials"] = creds
    if on_error: n["onError"] = on_error
    return n


def code(name, js, pos):
    return node(name, "code", 2, {"jsCode": js.strip()}, pos)


def http(name, method, url, pos, *, body=None, headers=None, cred=None,
         on_error=None):
    p = {"method": method, "url": url, "options": {"timeout": 120000}}
    if cred:
        p["authentication"] = "predefinedCredentialType"
        p["nodeCredentialType"] = cred
    if headers:
        p["sendHeaders"] = True
        p["specifyHeaders"] = "keypair"
        p["headerParameters"] = {"parameters":
                                 [{"name": k, "value": v} for k, v in headers.items()]}
    if body is not None:
        p["sendBody"] = True
        p["specifyBody"] = "json"
        p["jsonBody"] = body
    creds = {cred: {"id": "REPLACE_ON_IMPORT", "name": cred}} if cred else None
    return node(name, "httpRequest", 4.2, p, pos, creds, on_error)


def wf(name, nodes, chain):
    conns = {}
    for a, b in chain:
        conns.setdefault(a, {"main": [[]]})["main"][0].append(
            {"node": b, "type": "main", "index": 0})
    return {"name": name, "nodes": nodes, "connections": conns,
            "settings": {"executionOrder": "v1", "saveDataErrorExecution": "all"},
            "pinData": {}}


CONFIG_JS = """
// Non-secret config only — API keys live in n8n credentials.
// The Google client id/secret are the ONE exception: refreshing a per-mailbox
// token is a body parameter, not a header, so it cannot ride a credential.
return [{ json: {
  supabase: 'https://YOUR-PROJECT.supabase.co',
  appBase:  'https://unlimited-leads.net',
  googleClientId:     'YOUR_GOOGLE_CLIENT_ID',
  googleClientSecret: 'YOUR_GOOGLE_CLIENT_SECRET',
  model: 'claude-sonnet-5',
  sendBatch: 25,
  stepDelaysDays: [0, 3, 7],
}}];
"""

def config(pos=(-40, 300)): return code("Config", CONFIG_JS, pos)


# ===========================================================================
# 01 — Enroll. Leads in, a personalised sequence per lead, queued to send.
# ===========================================================================
ENROLL_FANOUT = r"""
// POST body: { campaign_id, leads: [{email, first_name, last_name, company, title}] }
// One output item per lead; the Claude node then fires once per item.
const campaign = ($('Get campaign').first().json || [])[0];
if (!campaign) throw new Error('campaign_id not found');

const leads = ($('Enroll webhook').first().json.body.leads || [])
  .filter(l => l && l.email && /.+@.+\..+/.test(l.email));
if (!leads.length) throw new Error('no valid leads in request');

const prompt = (l) => [
  'Write a 3-step cold email sequence.', '',
  'WHAT WE SELL:', campaign.brief, '',
  'PROSPECT:',
  `${l.first_name || ''} ${l.last_name || ''}`.trim() +
    `, ${l.title || 'unknown role'} at ${l.company || 'their company'}`, '',
  'Rules: under 90 words each. No greeting fluff, no "I hope this finds you well",',
  'no "just following up". Step 1 opens with something specific to their company.',
  'Steps 2 and 3 reply into the same thread and are shorter than step 1.',
  'One ask: a 15-minute call. Plain text, no markdown, no signature.',
  'Step 2 and 3 subjects must be empty strings (they reply in-thread).', '',
  'Return ONLY a JSON array, no prose:',
  '[{"subject":"...","body":"..."},{"subject":"","body":"..."},{"subject":"","body":"..."}]',
].join('\n');

return leads.map(l => ({ json: {
  campaign_id: campaign.id,
  email: String(l.email).toLowerCase().trim(),
  first_name: l.first_name || '', last_name: l.last_name || '',
  company: l.company || '', title: l.title || '',
  prompt: prompt(l),
}}));
"""

ENROLL_PARSE = r"""
// Fold every Claude response back into ONE item holding two arrays, so the
// inserts below are single bulk calls instead of one call per lead.
const delays = $('Config').first().json.stepDelaysDays;
const sources = $('Fan out leads').all();
const leads = [], drafts = [];

$input.all().forEach((item, i) => {
  const src = sources[i].json;
  let seq;
  try {
    const text = item.json?.content?.[0]?.text ?? '';
    seq = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1));
  } catch (e) { return; }        // one bad generation must not fail the batch
  if (!Array.isArray(seq) || !seq.length) return;

  leads.push({ campaign_id: src.campaign_id, email: src.email,
               first_name: src.first_name, last_name: src.last_name,
               company: src.company, title: src.title });

  seq.slice(0, delays.length).forEach((s, k) => {
    if (!s || !s.body) return;
    drafts.push({ email: src.email, step: k + 1,
      subject: String(s.subject || '').slice(0, 200), body: String(s.body),
      send_at: new Date(Date.now() + delays[k] * 864e5).toISOString() });
  });
});

if (!leads.length) throw new Error('no usable sequences generated');
return [{ json: { leads, drafts } }];
"""

ENROLL_ATTACH = r"""
// PostgREST handed back the inserted/merged lead rows; map email -> id.
const rows = $input.first().json;
const byEmail = Object.fromEntries(rows.map(r => [r.email, r.id]));
const messages = $('Build sequences').first().json.drafts
  .filter(d => byEmail[d.email])
  .map(d => ({ lead_id: byEmail[d.email], step: d.step, subject: d.subject,
               body: d.body, send_at: d.send_at }));
if (!messages.length) throw new Error('no messages to queue');
return [{ json: { messages, leads: rows.length, queued: messages.length } }];
"""

json.dump(wf("UL 01 — Enroll leads", [
    node("Enroll webhook", "webhook", 2,
         {"httpMethod": "POST", "path": "enroll", "responseMode": "responseNode"},
         (-260, 300)),
    config(),
    http("Get campaign", "GET",
         f"={SB}/rest/v1/campaigns?id=eq."
         "{{ $('Enroll webhook').first().json.body.campaign_id }}&select=*",
         (180, 300), cred="supabaseApi"),
    code("Fan out leads", ENROLL_FANOUT, (400, 300)),
    http("Claude writes sequence", "POST", "https://api.anthropic.com/v1/messages",
         (620, 300),
         body="={{ JSON.stringify({ model: $('Config').first().json.model,"
              " max_tokens: 1200, messages: [{ role: 'user', content: $json.prompt }] }) }}",
         cred="anthropicApi", on_error="continueRegularOutput"),
    code("Build sequences", ENROLL_PARSE, (840, 300)),
    http("Insert leads", "POST", f"={SB}/rest/v1/leads", (1060, 300),
         headers={"Prefer": "resolution=merge-duplicates,return=representation"},
         body="={{ JSON.stringify($json.leads) }}", cred="supabaseApi"),
    code("Attach lead ids", ENROLL_ATTACH, (1280, 300)),
    http("Queue messages", "POST", f"={SB}/rest/v1/messages", (1500, 300),
         headers={"Prefer": "return=minimal"},
         body="={{ JSON.stringify($json.messages) }}", cred="supabaseApi"),
    node("Respond", "respondToWebhook", 1.1,
         {"respondWith": "json",
          "responseBody": "={{ JSON.stringify($('Attach lead ids').first().json) }}"},
         (1720, 300)),
], [("Enroll webhook", "Config"), ("Config", "Get campaign"),
    ("Get campaign", "Fan out leads"), ("Fan out leads", "Claude writes sequence"),
    ("Claude writes sequence", "Build sequences"), ("Build sequences", "Insert leads"),
    ("Insert leads", "Attach lead ids"), ("Attach lead ids", "Queue messages"),
    ("Queue messages", "Respond")]),
    open(OUT / "01-enroll.json", "w"), indent=2)


# ===========================================================================
# 02 — Send. The only workflow that spends money.
# ===========================================================================
SEND_SPLIT = r"""
// next_sends() already claimed these rows (status -> 'sending') inside one
// transaction, so a second cron tick cannot pick them up. Nothing to filter.
const rows = $input.first().json;
if (!Array.isArray(rows) || !rows.length) return [];   // quiet tick, no error
return rows.map(r => ({ json: r }));
"""

SEND_MIME = r"""
// Build RFC822 and base64url it. Personalisation is deliberately dumb string
// replacement: the AI already wrote per-lead copy, these are just fallbacks.
const cfg = $('Config').first().json;
const claimed = $('Split messages').all();

const b64  = s => Buffer.from(s, 'utf8').toString('base64');
const b64u = s => b64(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const hdr  = s => /^[\x20-\x7E]*$/.test(s) ? s : '=?UTF-8?B?' + b64(s) + '?=';

return $input.all().map((tok, i) => {
  const m = claimed[i].json;
  const fill = t => String(t || '')
    .replace(/\{\{\s*first_name\s*\}\}/gi, m.first_name || 'there')
    .replace(/\{\{\s*company\s*\}\}/gi,    m.company || 'your team');

  const unsub = `${cfg.appBase}/u?t=${m.unsub_token}`;
  const rfcId = `<${m.message_id}@${(m.mailbox_email.split('@')[1] || 'mail')}>`;
  const body  = fill(m.body) +
    `\n\n--\nNot relevant? Unsubscribe: ${unsub}`;

  const h = [
    `From: ${m.from_name ? hdr(m.from_name) + ' ' : ''}<${m.mailbox_email}>`,
    `To: <${m.lead_email}>`,
    `Message-ID: ${rfcId}`,
    `List-Unsubscribe: <${unsub}>`,
    'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
  ];
  // A follow-up must reply into the thread it started, or it reads as a new
  // cold email and the thread history is lost.
  if (m.step > 1 && m.parent_rfc_id) {
    h.push(`In-Reply-To: ${m.parent_rfc_id}`, `References: ${m.parent_rfc_id}`);
    h.push(`Subject: ${hdr('Re: ' + (m.subject || '').replace(/^Re:\s*/i, ''))}`);
  } else {
    h.push(`Subject: ${hdr(fill(m.subject))}`);
  }

  return { json: {
    message_id: m.message_id,
    accessToken: tok.json.access_token,
    raw: b64u(h.join('\r\n') + '\r\n\r\n' + body),
    threadId: m.step > 1 ? (m.thread_id || undefined) : undefined,
    rfcId,
  }};
});
"""

SEND_RESULT = r"""
// One row per attempt. A send that failed must be recorded as failed, not left
// stuck in 'sending' forever — that row would never be retried or reported.
const sent = $('Split messages').all();
return $input.all().map((r, i) => {
  const ctx = $('Build MIME').all()[i].json;
  const ok  = !!r.json?.id;
  return { json: {
    ok, message_id: ctx.message_id, rfc_message_id: ctx.rfcId,
    provider_id: r.json?.id || null, thread_id: r.json?.threadId || null,
    error: ok ? null : JSON.stringify(r.json?.error || r.json || 'unknown').slice(0, 500),
  }};
});
"""

json.dump(wf("UL 02 — Send due emails", [
    node("Every 10 minutes", "scheduleTrigger", 1.2,
         {"rule": {"interval": [{"field": "minutes", "minutesInterval": 10}]}},
         (-260, 300)),
    config(),
    http("Claim due sends", "POST", f"={SB}/rest/v1/rpc/next_sends", (180, 300),
         body="={{ JSON.stringify({ p_limit: $json.sendBatch }) }}",
         cred="supabaseApi"),
    code("Split messages", SEND_SPLIT, (400, 300)),
    http("Refresh Google token", "POST", "https://oauth2.googleapis.com/token",
         (620, 300),
         body="={{ JSON.stringify({ client_id: $('Config').first().json.googleClientId,"
              " client_secret: $('Config').first().json.googleClientSecret,"
              " refresh_token: $json.refresh_token, grant_type: 'refresh_token' }) }}",
         on_error="continueRegularOutput"),
    code("Build MIME", SEND_MIME, (840, 300)),
    http("Gmail send", "POST",
         "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", (1060, 300),
         headers={"Authorization": "=Bearer {{ $json.accessToken }}"},
         body="={{ JSON.stringify($json.threadId"
              " ? { raw: $json.raw, threadId: $json.threadId } : { raw: $json.raw }) }}",
         on_error="continueRegularOutput"),
    code("Read results", SEND_RESULT, (1280, 300)),
    http("Record send", "POST",
         "={{ $('Config').first().json.supabase }}/rest/v1/rpc/"
         "{{ $json.ok ? 'mark_sent' : 'mark_failed' }}", (1500, 300),
         body="={{ JSON.stringify($json.ok"
              " ? { p_message_id: $json.message_id, p_provider_id: $json.provider_id,"
              " p_thread_id: $json.thread_id, p_rfc_message_id: $json.rfc_message_id }"
              " : { p_message_id: $json.message_id, p_error: $json.error }) }}",
         cred="supabaseApi"),
], [("Every 10 minutes", "Config"), ("Config", "Claim due sends"),
    ("Claim due sends", "Split messages"), ("Split messages", "Refresh Google token"),
    ("Refresh Google token", "Build MIME"), ("Build MIME", "Gmail send"),
    ("Gmail send", "Read results"), ("Read results", "Record send")]),
    open(OUT / "02-send.json", "w"), indent=2)


# ===========================================================================
# 03 — Replies. A reply ends the sequence, always.
# ===========================================================================
REPLY_SPLIT = r"""
const rows = $input.first().json;
if (!Array.isArray(rows) || !rows.length) return [];
return rows.map(r => ({ json: r }));
"""

REPLY_PAIR = r"""
// Pair each refreshed token back to its mailbox and ask Gmail for recent
// inbound only. -from:me keeps our own sends out of the result.
const boxes = $('Split mailboxes').all();
return $input.all().map((t, i) => ({ json: {
  mailbox_id: boxes[i].json.id,
  mailbox_email: boxes[i].json.email,
  accessToken: t.json.access_token,
}}));
"""

REPLY_FLATTEN = r"""
// Gmail returns thread stubs. Keep the thread ids, look them up in one query.
const ctx = $('Pair token to mailbox').all();
const out = [];
$input.all().forEach((res, i) => {
  const c = ctx[i].json;
  (res.json.messages || []).forEach(m => out.push({ json: {
    thread_id: m.threadId, gmail_id: m.id,
    mailbox_id: c.mailbox_id, accessToken: c.accessToken,
  }}));
});
if (!out.length) return [];
// dedupe: several messages can share a thread
const seen = new Set();
return out.filter(o => !seen.has(o.json.thread_id) && seen.add(o.json.thread_id));
"""

REPLY_MATCH = r"""
// Only threads that belong to a lead we are still sequencing are replies.
const known = $input.first().json;
if (!Array.isArray(known) || !known.length) return [];
const byThread = Object.fromEntries(known.map(l => [l.thread_id, l]));
return $('Flatten threads').all()
  .filter(t => byThread[t.json.thread_id])
  .map(t => ({ json: { ...t.json, lead: byThread[t.json.thread_id] } }));
"""

REPLY_CLASSIFY = r"""
const t = $json;
const snippet = (t.snippet || t.lead?.email || '').slice(0, 800);
const prompt = [
  'Classify this reply to a cold email. Answer with ONE word from:',
  'interested, not_interested, ooo, wrong_person, unsubscribe',
  '', 'Reply:', snippet,
].join('\n');
return [{ json: { ...t, prompt } }];
"""

REPLY_RECORD = r"""
const allowed = ['interested','not_interested','ooo','wrong_person','unsubscribe'];
const matched = $('Match to leads').all();
const fetched = $('Fetch snippets').all();
return $input.all().map((r, i) => {
  const word = (r.json?.content?.[0]?.text || '').toLowerCase().match(/[a-z_]+/)?.[0];
  return { json: {
    p_thread_id: matched[i].json.thread_id,
    // An unreadable classification is treated as interested on purpose: a
    // missed "yes" costs a meeting, a false "yes" costs ten seconds of reading.
    p_outcome: allowed.includes(word) ? word : 'interested',
    p_snippet: (fetched[i].json?.snippet || '').slice(0, 1000),
  }};
});
"""

json.dump(wf("UL 03 — Sync replies", [
    node("Every 15 minutes", "scheduleTrigger", 1.2,
         {"rule": {"interval": [{"field": "minutes", "minutesInterval": 15}]}},
         (-260, 300)),
    config(),
    http("Get mailboxes", "GET",
         f"={SB}/rest/v1/mailboxes?active=eq.true&select=id,email,refresh_token",
         (180, 300), cred="supabaseApi"),
    code("Split mailboxes", REPLY_SPLIT, (380, 300)),
    http("Refresh token", "POST", "https://oauth2.googleapis.com/token", (580, 300),
         body="={{ JSON.stringify({ client_id: $('Config').first().json.googleClientId,"
              " client_secret: $('Config').first().json.googleClientSecret,"
              " refresh_token: $json.refresh_token, grant_type: 'refresh_token' }) }}",
         on_error="continueRegularOutput"),
    code("Pair token to mailbox", REPLY_PAIR, (780, 300)),
    http("List inbox", "GET",
         "https://gmail.googleapis.com/gmail/v1/users/me/messages"
         "?q=in:inbox newer_than:2d -from:me&maxResults=50", (980, 300),
         headers={"Authorization": "=Bearer {{ $json.accessToken }}"},
         on_error="continueRegularOutput"),
    code("Flatten threads", REPLY_FLATTEN, (1180, 300)),
    http("Look up leads", "GET",
         f"={SB}/rest/v1/leads?status=eq.active&select=id,email,thread_id"
         "&thread_id=in.({{ $('Flatten threads').all()"
         ".map(t => t.json.thread_id).join(',') }})", (1380, 300),
         cred="supabaseApi"),
    code("Match to leads", REPLY_MATCH, (1580, 300)),
    http("Fetch snippets", "GET",
         "https://gmail.googleapis.com/gmail/v1/users/me/messages/"
         "{{ $json.gmail_id }}?format=metadata", (1780, 300),
         headers={"Authorization": "=Bearer {{ $json.accessToken }}"},
         on_error="continueRegularOutput"),
    code("Build classify prompt", REPLY_CLASSIFY, (1980, 300)),
    http("Claude classifies", "POST", "https://api.anthropic.com/v1/messages",
         (2180, 300),
         body="={{ JSON.stringify({ model: $('Config').first().json.model,"
              " max_tokens: 10, messages: [{ role: 'user', content: $json.prompt }] }) }}",
         cred="anthropicApi", on_error="continueRegularOutput"),
    code("Build reply rows", REPLY_RECORD, (2380, 300)),
    http("Record reply", "POST", f"={SB}/rest/v1/rpc/record_reply", (2580, 300),
         body="={{ JSON.stringify($json) }}", cred="supabaseApi"),
], [("Every 15 minutes", "Config"), ("Config", "Get mailboxes"),
    ("Get mailboxes", "Split mailboxes"), ("Split mailboxes", "Refresh token"),
    ("Refresh token", "Pair token to mailbox"), ("Pair token to mailbox", "List inbox"),
    ("List inbox", "Flatten threads"), ("Flatten threads", "Look up leads"),
    ("Look up leads", "Match to leads"), ("Match to leads", "Fetch snippets"),
    ("Fetch snippets", "Build classify prompt"),
    ("Build classify prompt", "Claude classifies"),
    ("Claude classifies", "Build reply rows"), ("Build reply rows", "Record reply")]),
    open(OUT / "03-replies.json", "w"), indent=2)


# ===========================================================================
# 04 — Unsubscribe. Legally load-bearing; it is two nodes.
# ===========================================================================
json.dump(wf("UL 04 — Unsubscribe", [
    node("Unsub link", "webhook", 2,
         {"httpMethod": "GET", "path": "u", "responseMode": "responseNode"},
         (-260, 300)),
    config(),
    http("Suppress", "POST", f"={SB}/rest/v1/rpc/unsubscribe", (180, 300),
         body="={{ JSON.stringify({ p_token: $('Unsub link').first().json.query.t }) }}",
         cred="supabaseApi", on_error="continueRegularOutput"),
    node("Confirm page", "respondToWebhook", 1.1,
         {"respondWith": "text",
          "responseBody": "<!doctype html><meta charset=utf-8>"
                          "<title>Unsubscribed</title>"
                          "<div style=\"font:16px/1.6 system-ui;max-width:32rem;"
                          "margin:20vh auto;padding:0 1rem\">"
                          "<h1 style=\"font-size:1.25rem\">You're unsubscribed.</h1>"
                          "<p>You won't hear from us again. Nothing else to do.</p></div>",
          "options": {"responseHeaders": {"entries": [
              {"name": "Content-Type", "value": "text/html; charset=utf-8"}]}}},
         (400, 300)),
], [("Unsub link", "Config"), ("Config", "Suppress"), ("Suppress", "Confirm page")]),
    open(OUT / "04-unsubscribe.json", "w"), indent=2)


# ===========================================================================
# 05 — Booking. The point of the entire system.
# ===========================================================================
BOOKING_JS = r"""
// Calendly invitee.created. Every provider names these differently, so pull
// defensively and fail loudly rather than silently recording nothing.
const p = $json.body?.payload || $json.body || {};
const email = p.email || p.invitee?.email;
if (!email) throw new Error('booking webhook had no invitee email: '
                            + JSON.stringify($json.body).slice(0, 300));
return [{ json: {
  p_email: String(email).toLowerCase(),
  p_name: p.name || p.invitee?.name || null,
  p_starts_at: p.scheduled_event?.start_time || p.event?.start_time || null,
  p_event_uri: p.uri || p.event?.uri || `${email}-${Date.now()}`,
}}];
"""

json.dump(wf("UL 05 — Record booking", [
    node("Calendar webhook", "webhook", 2,
         {"httpMethod": "POST", "path": "booked", "responseMode": "responseNode"},
         (-260, 300)),
    config(),
    code("Extract invitee", BOOKING_JS, (180, 300)),
    http("Record booking", "POST", f"={SB}/rest/v1/rpc/record_booking", (400, 300),
         body="={{ JSON.stringify($json) }}", cred="supabaseApi"),
    node("Ack", "respondToWebhook", 1.1,
         {"respondWith": "text", "responseBody": "ok"}, (620, 300)),
], [("Calendar webhook", "Config"), ("Config", "Extract invitee"),
    ("Extract invitee", "Record booking"), ("Record booking", "Ack")]),
    open(OUT / "05-booking.json", "w"), indent=2)

for f in sorted(OUT.glob("*.json")):
    d = json.load(open(f))
    print(f"{f.name:22} {len(d['nodes']):>2} nodes")
