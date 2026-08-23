# Patch: monthly job-change monitoring

> Apply **after** `SUBSCRIBER-GATE-PATCH.md`. This depends on
> `subscriberStatus(env, token)` returning `'yes' | 'no' | 'unknown'`.

## Why this exists

`docs/data-provider-angle.md` §1: users who run one kind of lookup over one
list churn within a week, every time. Users who keep coming back are the ones
whose work recurs. Nothing in the product currently *creates* work — every
enrichment today is user-initiated, which is why 31 of 1,401 enriching users
ever reached four active days.

The weekly sync fills fields that are **missing**. That finishes: once a
contact has an email, it has one forever, and the customer is done with us.

This pass re-checks fields that are **wrong**. That never finishes, because
people change jobs at roughly 20% a year whether or not anyone is looking. It
is the only mechanism in the CRM feature that consumes credits with no user
action, which is the whole retention argument.

It is also the piece the customer can see the value of every month: *these six
people left the companies you sell to, and these six just landed somewhere new.*
A contact leaving is a churn signal. The same contact arriving somewhere else
is a warm lead. That report is the reason to keep paying.

---

## What it does

Once a month, for each connected **subscriber** who has switched it on:

1. Ask HubSpot for contacts that have a LinkedIn URL and have not been checked
   in 30 days.
2. Run `linkedin_profile_to_linkedin_info` on each (10 credits, always async).
3. Compare the current company against what HubSpot holds.
4. When it differs: write the new company and job title, record the previous
   company, and stamp the change date.
5. Always stamp `linkfinder_last_checked`, so step 1 is self-advancing and no
   contact is ever paid for twice in a month.

HubSpot is the cursor. Nothing per-contact goes in KV — a customer with 40,000
contacts would otherwise put 40,000 keys in one record.

---

## Step 1 — three custom properties

The pass needs somewhere to write. Create-if-missing on the first run:

```js
const MONITOR_PROPS = [
  { name: 'linkfinder_last_checked',        label: 'LinkFinder Last Checked',        type: 'date',   fieldType: 'date' },
  { name: 'linkfinder_job_change_detected', label: 'LinkFinder Job Change Detected', type: 'date',   fieldType: 'date' },
  { name: 'linkfinder_previous_company',    label: 'LinkFinder Previous Company',    type: 'string', fieldType: 'text' },
];

// Idempotent: HubSpot answers 409 for a property that already exists, which is
// success for our purposes. Runs once per pass; the cost is three cheap calls.
async function ensureMonitorProps(env, connectionId) {
  for (const p of MONITOR_PROPS) {
    const r = await nangoProxy(env, connectionId, 'POST', '/crm/v3/properties/contacts', {
      ...p, groupName: 'contactinformation',
    });
    if (r.status !== 201 && r.status !== 409) {
      console.error(`[crm-monitor] could not create ${p.name}: ${r.status}`);
      return false;
    }
  }
  return true;
}
```

> **Scope check before shipping.** Creating a property needs
> `crm.schemas.contacts.write` on the HubSpot integration in Nango. The current
> integration was set up for contact read/write only. If the scope is missing
> this returns 403 and the whole pass no-ops — verify in the Nango dashboard
> first, and note that **adding a scope forces every existing customer to
> reconnect.** If you would rather not break existing connections, drop
> `linkfinder_previous_company` and reuse two properties the portal already has.

## Step 2 — find who is due

```js
const MONITOR_INTERVAL_DAYS = 30;

async function findStaleContacts(env, connectionId, limit) {
  const cutoff = Date.now() - MONITOR_INTERVAL_DAYS * 86400000;

  // Two conditions OR'd: never checked, or checked long enough ago. HubSpot
  // search treats each filterGroup as an OR of ANDs.
  const hasUrl = { propertyName: 'linkedinbio', operator: 'HAS_PROPERTY' };
  const body = {
    filterGroups: [
      { filters: [hasUrl, { propertyName: 'linkfinder_last_checked', operator: 'NOT_HAS_PROPERTY' }] },
      { filters: [hasUrl, { propertyName: 'linkfinder_last_checked', operator: 'LT', value: String(cutoff) }] },
    ],
    properties: ['linkedinbio', 'company', 'jobtitle', 'linkfinder_last_checked'],
    limit,
  };

  const r = await nangoProxy(env, connectionId, 'POST', '/crm/v3/objects/contacts/search', body);
  if (!r.ok) {
    console.error(`[crm-monitor] search failed ${r.status}`);
    return [];
  }
  return (r.body.results || []);
}
```

## Step 3 — the pass

```js
// 10 credits each and always async. 25 is deliberate: it is 250 credits a
// month, which a Starter plan (5,000) absorbs without noticing, and it stays
// inside a Worker's subrequest budget once each lookup's polling is counted.
const MONITOR_MAX_PER_RUN = 25;

function normaliseCompany(s) {
  return String(s || '').toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|gmbh|sa|sas|bv|plc|co)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

async function monitorOneConnection(env, linkfinderToken, record) {
  const status = await subscriberStatus(env, linkfinderToken);
  // 'unknown' must not be treated as 'no' here either - see the gate patch.
  if (status !== 'yes') return { checked: 0, changed: 0, skipped: status };

  const settings = record.settings || {};
  if (!settings.monitorEnabled) return { checked: 0, changed: 0, skipped: 'off' };

  if (!(await ensureMonitorProps(env, record.connectionId))) {
    return { checked: 0, changed: 0, skipped: 'props' };
  }

  const cap = Math.min(settings.monitorMaxPerRun || MONITOR_MAX_PER_RUN, MONITOR_MAX_PER_RUN);
  const contacts = await findStaleContacts(env, record.connectionId, cap);

  const today = new Date().toISOString().slice(0, 10);
  let checked = 0, changed = 0;
  const changes = [];

  for (const c of contacts) {
    const url = c.properties.linkedinbio;
    if (!url) continue;

    const info = await runEnrichment(env, linkfinderToken, 'linkedin_profile_to_linkedin_info', url);

    // Out of credits is a stop, not a skip. Continuing would fire the whole
    // remaining batch at a wall and log 24 identical failures.
    if (info.insufficientCredits) {
      console.log(`[crm-monitor] ${linkfinderToken}: out of credits after ${checked}`);
      break;
    }
    // A single dead profile must not abort the pass, but it must NOT be
    // stamped as checked either - stamping it would hide it for 30 days on
    // the strength of a failure.
    if (!info.ok || !info.result) continue;

    checked++;

    const nowCompany = info.result.company_name || info.result.company || '';
    const wasCompany = c.properties.company || '';
    const moved = nowCompany && wasCompany &&
                  normaliseCompany(nowCompany) !== normaliseCompany(wasCompany);

    const props = { linkfinder_last_checked: today };
    if (moved) {
      props.company = nowCompany;
      props.jobtitle = info.result.job_title || info.result.title || c.properties.jobtitle || '';
      props.linkfinder_previous_company = wasCompany;
      props.linkfinder_job_change_detected = today;
      changed++;
      changes.push({ id: c.id, from: wasCompany, to: nowCompany });
    }

    await nangoProxy(env, record.connectionId, 'PATCH',
      `/crm/v3/objects/contacts/${c.id}`, { properties: props });
  }

  return { checked, changed, changes };
}
```

## Step 4 — schedule it

The existing cron is weekly. Monitoring is monthly, and the 30-day
`linkfinder_last_checked` filter already enforces that per contact — so it can
ride the same weekly trigger without over-spending. A contact checked on the
3rd is simply invisible to the next three passes.

```js
// In the scheduled() handler, after the existing fill pass for this connection:
const mon = await monitorOneConnection(env, linkfinderToken, record);
if (mon.checked) {
  console.log(`[crm-monitor] ${linkfinderToken}: ${mon.checked} checked, ${mon.changed} moved`);
  record = { ...record, lastMonitorResult: { at: new Date().toISOString(), ...mon } };
  await env.CRM_CONNECTIONS.put(`conn:${linkfinderToken}`, JSON.stringify(record));
}
```

Spreading the fill pass and the monitor pass across the same run is fine — they
touch disjoint contacts by construction. The fill pass looks for contacts
**missing** a field; the monitor pass requires `linkedinbio` to be **present**.

## Step 5 — expose it

`/status` should return `lastMonitorResult` so `crm-sync.html` can render the
monthly report, and `/save-settings` must accept `monitorEnabled` and
`monitorMaxPerRun`. Both are additive — no existing field changes shape.

Default `monitorEnabled` to **false**. It spends 10 credits per contact without
anyone pressing a button; that has to be a decision the customer makes, and
the page has to say the number out loud before they make it.

---

## What is untested

Written without network access to HubSpot, Nango or the LinkFinder API. Before
deploying:

1. **The scope question in Step 1** — this is the one that can force every
   customer to reconnect. Settle it first.
2. `HAS_PROPERTY` / `NOT_HAS_PROPERTY` against a custom date property, and
   whether HubSpot search wants an epoch-millisecond string for a date `LT`
   (used above) or `YYYY-MM-DD`. Run the search body by hand once.
3. The field names on `linkedin_profile_to_linkedin_info` — the code reads
   `company_name` then `company`, and `job_title` then `title`, because the
   live shape was not verifiable here. One real response settles it.
4. `runEnrichment` must actually surface an out-of-credits condition as
   `insufficientCredits`. If it does not, add it — the `break` above is the
   only thing standing between a low balance and 25 wasted calls.

Watch the first cron run's logs before switching it on for anyone but yourself.

---

## Also, while in this file

`/disconnect` deletes the KV record and leaves the Nango connection alive, so a
customer who disconnects by hand keeps costing a connection slot every month.
Have it call `releaseConnection` from `SUBSCRIBER-GATE-PATCH.md` first, then
delete the record.
