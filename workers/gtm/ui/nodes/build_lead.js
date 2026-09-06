// From the writer's answer to one Instantly lead.
//
// Pairs by the email the model was asked to echo back, not by position, so a
// skipped or reordered item cannot attach someone's copy to someone else.
// Finds the JSON by brace matching rather than expecting the whole reply to
// be JSON: an agent that adds a sentence first no longer loses the lead.
const cfg = $('Config').first().json;
const leads = $('One item per lead').all().map(i => i.json);
const byEmail = Object.fromEntries(leads.map(l => [String(l.email).toLowerCase(), l]));

const extract = text => {
  if (typeof text !== 'string') return null;
  const s = text.indexOf('{');
  if (s < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = s; i < text.length; i++) {
    const ch = text[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (!depth) { try { return JSON.parse(text.slice(s, i + 1)); } catch (e) { return null; } } }
  }
  return null;
};

const out = [], problems = [];
const replies = $input.all();
replies.forEach((item, i) => {
  const r = item.json || {};
  let text = r.output ?? r.text ?? r.choices?.[0]?.message?.content ?? '';
  if (typeof text !== 'string') text = JSON.stringify(text);
  const email = extract(text);
  if (!email || !email.subject || !email.body) { problems.push('item ' + i + ': no subject/body JSON in: ' + String(text).slice(0, 120)); return; }
  const key = String(email.email || '').toLowerCase();
  const lead = byEmail[key] || leads[i];
  if (!lead) { problems.push('item ' + i + ': could not pair to a lead'); return; }
  const body = String(email.body).replace(/\r\n/g, '\n').trim();
  const words = body.split(/\s+/).length;
  if (words > 160) problems.push(lead.email + ': ' + words + ' words, long for a cold email');
  out.push({ json: {
    email: lead.email,
    first_name: lead.first_name,
    last_name: lead.last_name,
    company_name: lead.company_name,
    website: lead.company_domain,
    custom_variables: {
      ai_subject: String(email.subject).trim(),
      ai_body: body.replace(/\n/g, '<br>'),     // for an HTML step
      ai_body_text: body,                        // for a plain-text step
    },
    // Kept out of what is sent, useful in the node output.
    _preview: '── ' + lead.full_name + ' <' + lead.email + '> · ' + lead.company_name + '\nSubject: ' + email.subject + '\n\n' + body,
  } });
});

if (problems.length) console.log('Build the lead: ' + problems.length + ' problem(s)\n' + problems.join('\n'));
console.log(out.length + ' emails ready' + (cfg.dry_run ? ' (dry run — read them in this node\'s output, nothing is sent)' : ' for campaign ' + cfg.instantly_campaign_id));
if (!out.length) throw new Error('Nothing to send — the writer produced no usable subject/body JSON. ' + problems.join(' | '));
return out;
