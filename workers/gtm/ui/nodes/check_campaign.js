// Fail early on the one thing that silently ruins every email.
//
// Leads are added to an EXISTING Instantly campaign with the per-lead copy as
// custom variables {{ai_subject}} and {{ai_body}}. If that campaign's own
// sequence does not reference those variables, Instantly sends its static
// template to everyone and the personalised copy is never seen. That is an
// easy way to get "bad emails" with a flow that looks like it worked.
//
// This runs right after Config, before a single credit is spent. In dry-run
// mode it does nothing: the run produces the drafted emails as node output
// and touches Instantly not at all.
const cfg = $input.first().json;
if (cfg.dry_run) {
  console.log('Dry run: Instantly will not be called. Flip dry_run in Config to send.');
  return [{ json: cfg }];
}
const id = cfg.instantly_campaign_id;
if (!id || String(id).startsWith('PUT_')) {
  throw new Error('dry_run is off but instantly_campaign_id is not set. Put the campaign id from the Instantly URL in Config.');
}
if (!cfg.instantly_key || String(cfg.instantly_key).startsWith('PUT_')) {
  throw new Error('dry_run is off but instantly_key is not set.');
}
if (!this.helpers || !this.helpers.httpRequest) return [{ json: cfg }];

let camp;
try {
  camp = await this.helpers.httpRequest({ method: 'GET', json: true,
    url: 'https://api.instantly.ai/api/v2/campaigns/' + encodeURIComponent(id),
    headers: { Authorization: 'Bearer ' + cfg.instantly_key } });
} catch (e) {
  throw new Error('Could not read Instantly campaign ' + id + ': ' + e.message);
}
const text = JSON.stringify(camp.sequences || camp);
const uses = v => text.includes('{{' + v + '}}');
if (!uses('ai_body')) {
  throw new Error('Campaign "' + (camp.name || id) + '" does not use {{ai_body}} in its sequence, so every lead ' +
    'would get the campaign\'s static text instead of the email written for them. In Instantly, set the step ' +
    'subject to {{ai_subject}} and the body to {{ai_body}} (or {{ai_body_text}} for a plain-text campaign), ' +
    'then run again.');
}
console.log('Campaign "' + (camp.name || id) + '" uses {{ai_body}}' + (uses('ai_subject') ? ' and {{ai_subject}}' : ' (subject is the campaign\'s own)') +
  '; status ' + (camp.status ?? '?'));
return [{ json: cfg }];
