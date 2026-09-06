#!/usr/bin/env python3
"""Add Explee people-by-domains as a third fallback on company_domain_to_employees.

The branch today is: Apify company-employees-scraper -> if that returns nothing
usable, Apify leads-finder-apollo -> respond. This inserts one Code node after
the second attempt, so a domain both actors miss gets a third try.

It changes ONE connection and adds ONE node. It does not touch credits, the
refund path, or the response contract:

  Code54 -> Respond to Webhook30            (before)
  Code54 -> Explee fallback -> Respond ...  (after)

The node emits the same {employees, totalCount, companyName, timestamp} shape,
so `If14` still decides the refund on real numbers.

**It cannot make the endpoint worse.** No key, an Explee error, a timeout, an
unexpected shape, or nothing found — every one of those returns exactly what
Code54 produced. It never throws, because a production webhook must answer.

    python3 add-explee-fallback.py in.json out.json
"""
import json
import sys

NODE_NAME = "Explee fallback (people-by-domains)"

CODE = r"""// Third attempt at a domain both Apify actors missed.
//
// Pass-through by default: if the previous step already found people, or
// there is no Explee key, or anything at all goes wrong, this returns its
// input untouched. The endpoint behaves exactly as it does today unless
// Explee actually adds something.
const passthrough = $input.all();
const prev = passthrough[0] && passthrough[0].json ? passthrough[0].json : {};

// The same "found nothing" test If14 uses downstream, so this fires on
// precisely the cases that would otherwise be refunded.
const foundNothing = (prev.companyName === 'Unknown' && prev.totalCount === 1)
  || !prev.totalCount
  || !(prev.employees || []).some(e => e && (e.firstName || e.name));

const KEY = ($env && $env.EXPLEE_API_KEY) || '';
if (!foundNothing || !KEY || !this.helpers || !this.helpers.httpRequest) {
  return passthrough;
}

try {
  const body = $('Webhook').first().json.body || {};
  const domain = String(body.input_data || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  if (!domain) return passthrough;

  // Never more people than the customer was charged for.
  const cap = Number($('Precheck Credits').first().json.employeeLimit) || 10;

  // Explee matches titles semantically, so a short list beats an exhaustive
  // one. Derive from the request when it says something, else cover the
  // usual buyers.
  const sen = String(body.seniority || '').trim().toLowerCase();
  const dep = String(body.department || '').trim().toLowerCase();
  const BY_SENIORITY = {
    founder: ['Founder'], owner: ['Owner'], c_suite: ['CEO', 'CTO', 'CFO'],
    partner: ['Partner'], vp: ['VP'], director: ['Director'],
    head: ['Head of'], manager: ['Manager'],
  };
  let titles = BY_SENIORITY[sen] || [];
  const depWords = dep.replace(/_/g, ' ');
  if (dep && dep !== 'all') {
    titles = titles.length ? titles.map(t => depWords + ' ' + t) : [depWords];
  }
  if (!titles.length) titles = ['Founder', 'CEO', 'Director', 'Head of Sales', 'Manager'];

  const res = await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://api.explee.com/public/api/v1/search/people-by-domains',
    headers: { 'X-API-Key': KEY },
    body: { domains: [domain], job_titles: titles.slice(0, 20),
            people_per_company: Math.min(cap, 25) },
    json: true,
    timeout: 45000,
  });

  const rows = (res && (res.people || res.results || res.items)) || [];
  if (!rows.length) return passthrough;

  // Same field names the other two providers are mapped to, so callers see
  // one shape whichever provider answered.
  const employees = rows.slice(0, cap).map(d => ({
    personId: d.person_id ?? d.id ?? null,
    name: d.full_name ?? d.name ?? null,
    firstName: d.first_name ?? null,
    lastName: d.last_name ?? null,
    jobTitle: d.job_title ?? d.title ?? null,
    headline: d.headline ?? null,
    seniority: d.seniority ?? null,
    department: d.department ?? null,
    email: d.email ?? null,
    mobileNumber: d.phone ?? null,
    linkedinUrl: d.linkedin_url ?? d.linkedin ?? null,
    city: d.city ?? null,
    state: d.state ?? null,
    country: d.country ?? null,
    company: d.company_name ?? d.company ?? null,
    companyWebsite: d.company_domain ?? domain,
    companyLinkedinUrl: d.company_linkedin_url ?? null,
    source: 'explee',
  }));

  console.log('Explee fallback: ' + employees.length + ' for ' + domain);
  return [{ json: {
    employees,
    totalCount: employees.length,
    companyName: employees[0].company || domain,
    timestamp: new Date().toISOString(),
  } }];
} catch (e) {
  // A fallback that breaks the endpoint is worse than no fallback.
  console.log('Explee fallback skipped: ' + e.message);
  return passthrough;
}"""


def patch(wf):
    names = {n["name"] for n in wf["nodes"]}
    if NODE_NAME in names:
        sys.exit("already patched")
    for required in ("Code54", "Respond to Webhook30", "Webhook", "Precheck Credits"):
        if required not in names:
            sys.exit(f"expected node missing: {required!r} — is this the right export?")

    into = [(a, i) for a, sp in wf["connections"].items()
            for i, o in enumerate(sp.get("main", []))
            for c in (o or []) if c["node"] == "Respond to Webhook30"]
    if into != [("Code54", 0)]:
        sys.exit(f"Respond to Webhook30 is fed by {into}, not just Code54 — look before patching")

    src = next(n for n in wf["nodes"] if n["name"] == "Code54")
    x, y = src["position"]
    wf["nodes"].append({
        "parameters": {"jsCode": CODE},
        "id": "explee-fallback-people-by-domains",
        "name": NODE_NAME,
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [x + 104, y + 180],
        # Belt and braces: even an unhandled throw keeps the webhook answering.
        "onError": "continueRegularOutput",
    })
    wf["connections"]["Code54"] = {
        "main": [[{"node": NODE_NAME, "type": "main", "index": 0}]]}
    wf["connections"][NODE_NAME] = {
        "main": [[{"node": "Respond to Webhook30", "type": "main", "index": 0}]]}
    return wf


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    data = patch(json.load(open(sys.argv[1])))
    data["name"] = data.get("name", "LinkFinder AI app") + " (Explee fallback)"
    data.pop("id", None)
    data.pop("versionId", None)
    data["active"] = False
    json.dump(data, open(sys.argv[2], "w"), indent=2)
    print(f"wrote {sys.argv[2]}: {len(data['nodes'])} nodes, imported inactive")
