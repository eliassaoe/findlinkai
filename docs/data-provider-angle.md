# Becoming a data provider, not a credit vendor

> **Update, 27 Aug.** The AI lead finder referenced below is now removed rather than
> parked — `leads_finder_ai` is gone from the API surface and from every integration.
> The reasoning here still explains why, and is kept as the record of that decision.

Written 2026-08-23, from `enrichment_history` + `linkfinderai_users`.

Question this answers: *who actually stays, and what do we sell them so one
account is worth hundreds–thousands a month instead of $49?*

This replaces the recommendation in `outbound-angle.md` ("sell the job"). That
one produces cash but not a relationship, which is not what we want.

---

## 1. There are exactly two usage shapes, and only one of them survives

### Shape A — bulk resolver (dies)

One single `type`, thousands of rows, 4–6 active days, never seen again.

| user | lookups | types | active days | last used |
| --- | --- | --- | --- | --- |
| digitalmarketing@kbscorporate.com | 14,064 | `lead_full_name_to_linkedin_url` only | 6 | 2026-06-26 |
| steven@salesignition.com (subscriber) | 9,058 | `lead_full_name_to_linkedin_url` only | 4 | 2026-06-12 |
| ayamit05@gmail.com | 3,274 | `lead_full_name_to_linkedin_url` only | 5 | 2026-06-19 |

These people had a list. They resolved the list. The job finished, so they
finished. **26,000 lookups between them and zero of them is still here.**
No pricing change retains this shape — there is nothing left to do.

### Shape B — waterfall / account expansion (survives)

Several types chained: company name → website → domain → employees → contact →
verify. Moderate daily volume, long calendar span.

| user | lookups | active days | span | shape |
| --- | --- | --- | --- | --- |
| (anon token) | 5,325 | 29 | 78d | website → employees → name→li → verify |
| pim@cambium.ai | 1,185 | **22** | **84d** | website → employees → profile info → email |
| vaibhavkambli276@gmail.com | 1,381 | 7 | 28d | employees → website |
| development@yieldergroup.com | 430 | 6 | 18d | profile info ×422 |

### The one variable that moves retention

Users who ever ran `company_domain_to_employees` or `company_name_to_website`:

| ran account expansion | users | reached 4+ active days | rate |
| --- | --- | --- | --- |
| no | 1,163 | 20 | **1.7%** |
| yes | 238 | 11 | **4.6%** |

2.7× better. It is the only behavioural variable in the data that predicts
coming back. Nothing else does — not plan, not subscription, not volume. The
highest-volume user (14,064) and the best-retained real user (22 days) are
**both non-subscribers**, and only one of 30 subscribers shows sustained use.

Be honest about the absolute number though: 1,401 users have ever enriched and
**31 reached four active days.** Retention is ~2%. That is not a pricing
problem, it is a structural one — see next section.

---

## 2. Why $89 can never become $1,000

`pim@cambium.ai`, our best-retained real customer, consumed 1,185 credits in
84 days. At list price that is **~$12/month of value.** Ten times more usage is
still only $120.

To bill $1,000/month you need roughly 50,000–100,000 credits/month moving. **A
human clicking a UI does not generate that.** Only a machine does.

So the offer has to be one where **rows arrive without the customer doing
anything.** Every product decision below follows from that single line.

---

## 3. The three machines, ranked

### 1. CRM enrichment on write — build this, it is 90% done
Every contact and company that lands in their HubSpot gets enriched the moment
it lands, forever. Rows arrive because *their* marketing runs, not because they
remembered us. `crm-sync.html` + `nango-connect-session` already do this; the
subscriber gate patch is written and undeployed (task #25).

### 2. Account-list maintenance — the actual recurring product
Customer hands over 300–5,000 target accounts. We return the full buying
committee with contacts, **and re-check it every month.** People change jobs at
roughly 20%/year, so their file rots at ~2%/month whether they touch it or not.
The work recurs because reality recurs.

This is not a new capability. It is exactly what Shape B users already do by
hand — `company_domain_to_employees` to expand, `linkedin_profile_to_linkedin_info`
(10 credits) to re-check current title and company.

The unit economics close cleanly:

    5,000 records re-checked monthly x 10 credits = 50,000 credits/mo
    Sold at $500/mo  = $0.10 per record per month
    25,000 records   = 250,000 credits  ->  $1,500/mo

That is a number naturally in the hundreds–thousands, because it is priced per
record maintained, not per lookup performed.

### 3. API / white-label into an agency
An agency with 20 clients does 20 list builds a month, forever. One contract
multiplies by their client count. This is why the ICP below is agencies.

---

## 4. Who to sell to

**Not** founders doing their own outbound. That is the $49 plan and the burnout
curve above.

Every business-domain account in the retained set is an agency or a service
firm: `cambium.ai`, `salesignition.com`, `theagilecoach.com`, `yieldergroup.com`,
`kbscorporate.com`. That is the tell.

Target:
- **Lead-gen / outbound agencies with 5–40 clients.** They rebuild lists every
  month by contract. Buying committee data is their cost of goods.
- **RevOps consultancies** running HubSpot/Salesforce for mid-market clients.
  Data hygiene is a line item they already bill for.
- **In-house RevOps at 50–500 person B2B companies on HubSpot.** They own a
  database quality metric and have budget attached to it.

---

## 5. The angle

Everybody sells *finding* an email. Nobody is on the hook for the file staying
correct. That is the whole opening, and it is the only frame that is recurring
by nature:

> Your target-account file decays about 2% a month — people change jobs and
> nobody tells your CRM. We re-verify and re-fill it every month, so you never
> run a list build again.

Lead with a free audit of *their* data, not a demo of ours: take 200 records
from their CRM, show what percentage is stale, name the people who left. The
CRM audit engine (task #20) already produces exactly this artifact. A number
about their own database is the only cold email that gets a reply from someone
who buys at this price.

Do **not** open with credits, per-lookup pricing, or plan tiers. Those frame us
as a tool and cap the deal at $89.

---

## 6. What blocks this today

1. **Task #25** — the subscriber-gate patch for `nango-connect-session` is
   written and not deployed. Machine #1 does not run until it is.
2. **Task #29** — 38 Instantly sending accounts are disconnected. No outbound
   can go out at all right now.
3. **Nothing in the product creates work.** Every enrichment today is
   user-initiated, which is why retention is 2%. Scheduled re-checks (machine
   #2) is the fix and does not exist yet.

---

## 7. Roadmap decision — 2026-08-23

Sequence agreed: **CRM → monitoring → integrations → agent (parked).**

### Finish CRM sync now
Machine #1. ~90% built. Cleanup is the one-time hook; the sync is what keeps
consuming credits after the customer stops paying attention. Nothing else
buildable this month has that property.

### Monitoring is part of CRM, not a separate feature
Elias flagged job-change monitoring as "speculative". It is the opposite — it
is the least speculative item on the list and the only one that changes the
billing shape:

- Touches **no** Apify / lead-search code. Runs
  `linkedin_profile_to_linkedin_info` (10 credits) over records the customer
  already supplied. Nothing to source, no vendor that can 403 us.
- It is a cron on top of the CRM sync, not a new product.
- It is the only mechanism that consumes credits with no user action, which
  section 1 says is the entire retention problem. 5,000 monitored records ×
  10 credits = 50,000 credits/month from one account, recurring.

Treat it as the last 10% of the CRM feature.

### Integrations (Make / n8n / Zapier) are distribution, not retention
An integration only retains if the customer builds a workflow — a setup cost
most users never pay. It will not move the 1.7% baseline. What it *is* worth:
free, permanent, intent-qualified discovery in three directories where the
section-4 ICP (agencies, RevOps) already lives. Prioritise **getting listed**
over building deeply. Zapier and Make review queues take weeks of calendar
time and almost none of ours — submit early and let them sit. n8n is blocked
only on npm credentials (task #22).

### The AI lead-sourcing agent stays parked
Not because of scope. Because **it is the lead finder we removed on 23 Aug,
with a scheduler on top.** See `lead-search-bugs.md`: `find_leads_ai` 403s for
every user (unapproved Apify actor) and `find_company_employees` still returns
the actor's placeholder rows as people. Running that unattended, on a schedule,
writing into a customer's production CRM converts an embarrassing bug into a
churn-and-refund event.

Also the most crowded category available — Clay, Apollo, Instantly's own lead
finder. Not a fight to pick at 30 subscribers.

**Unpark it when:** the Apify actor is approved and error-handled, bug 2 is
fixed, and MRR is past 10k.
