// Add the leads to the Instantly campaign, 100 at a time.
//
// Only reached when dry_run is off (the Send? node). skip_if_in_workspace
// means a person already anywhere in your Instantly is never added twice.
const cfg = $('Config').first().json;
if (!this.helpers || !this.helpers.httpRequest) throw new Error('This n8n has no this.helpers.httpRequest in Code nodes.');
const leads = $input.all().map(i => { const { _preview, ...lead } = i.json; return lead; });
const CHUNK = 100;
let added = 0, skipped = 0;
const results = [];
for (let i = 0; i < leads.length; i += CHUNK) {
  const chunk = leads.slice(i, i + CHUNK);
  let r;
  try {
    r = await this.helpers.httpRequest({ method: 'POST', url: 'https://api.instantly.ai/api/v2/leads/list', json: true,
      headers: { Authorization: 'Bearer ' + cfg.instantly_key, 'Content-Type': 'application/json' },
      body: { campaign_id: cfg.instantly_campaign_id, skip_if_in_campaign: true, skip_if_in_workspace: true, leads: chunk } });
  } catch (e) {
    throw new Error('Instantly rejected chunk ' + (i / CHUNK + 1) + ' (' + chunk.length + ' leads) after ' + added + ' were added: ' + e.message);
  }
  const n = Number(r && (r.leads_uploaded ?? r.uploaded ?? r.added ?? r.total_sent ?? chunk.length));
  added += n; skipped += Math.max(0, chunk.length - n);
  results.push({ chunk: i / CHUNK + 1, sent: chunk.length, response: r });
}
console.log('Instantly: ' + added + ' leads added to campaign ' + cfg.instantly_campaign_id + (skipped ? ', ' + skipped + ' skipped as already present' : '') + '. The campaign stays as it was — arm it in Instantly.');
return [{ json: { added, skipped, campaign_id: cfg.instantly_campaign_id, chunks: results.length } }];
