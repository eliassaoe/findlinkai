# Outbound: free CRM audit

Two campaigns, both **drafts in Instantly**. Neither has leads attached and
neither can send.

| Campaign | ID | Senders |
|---|---|---|
| CRM audit — lead-gen agencies (US/UK) | `6ee36aa4-3781-45fc-bd8f-5804cfe87196` | 9× partnerships / marketing / sales |
| CRM audit — RevOps / Sales Ops, HubSpot (US/UK) | `ecae6bf8-3a1f-409e-8254-cc7843be1b10` | 6× team / pro |

Agencies first — fastest validation. RevOps second, once the process is proven.
Separate sender domains so a bad result on one does not contaminate the other.

Both are 4 steps over 13 days: **day 0 → +3 → +5 → +5**. Email 1 asks for a
reply rather than a click ("Want the link?"), which reads as human, gets an
engagement signal, and keeps a URL out of the first touch on domains that have
just come back from an outage. Steps 2–4 have blank subjects so they thread
under the original.

Neither campaign sells anything. Every email offers the free audit and nothing
else — the upgrade happens later, on the site, after the tool has proved useful.

## STEP 0 — nothing can send yet

**All 38 Instantly accounts are at `status: -1`, `autofix_failed: true`, and
sent zero emails between 15 and 22 Aug.** Several report
`EAUTH — can't create new access token for user`; one Gmail account hit
`550-5.4.5 daily user sending limit exceeded`.

The domains are fine. MX, SPF, DKIM and DMARC all pass on every domain tested
(`linkfinderai-partnerships.com`, `-sales.com`, `-pro.com`,
`get-unlimited-leads.com`), and warmup scores sit at 90–100. This is an OAuth
reconnection in Instantly, not a rebuild.

Reconnect first. A perfect campaign on disconnected mailboxes sends nothing.

## Settings, and why

`text_only: true`, `open_tracking: false`, `link_tracking: false` — no tracking
pixel and no URL rewriting, which is the single biggest deliverability lever on
domains resuming after an outage. Attribution does not suffer: every link
carries `utm_source=instantly&utm_medium=outbound&utm_campaign=…`, the public
audit page forwards those UTMs into the signup URL, and PostHog reports the
funnel end to end.

`daily_limit: 20` per account, not the 30 the accounts allow. Ramp after two
clean weeks. `stop_on_reply` and `stop_on_auto_reply` are on.

Capacity once reconnected: 9 senders × 20 = **180/day** on the agency campaign,
≈ 45 new prospects/day on a 4-step sequence, ≈ **900/month**.

## The landing page had to be built

`/crm-sync` is behind `checkAuth()` and redirects anyone without a token to the
homepage — so every cold click would have bounced. `crm-audit.html` is the
public twin: same engine, no account, still browser-only, CTA to signup instead
of to a plan. **It must be deployed before either campaign is enabled**, or the
links 404.

## Before enabling

1. Reconnect the Instantly accounts (step 0).
2. Merge and deploy so `linkfinderai.com/crm-audit` resolves. Open it and run a
   real CSV through it.
3. Attach leads. Neither campaign has a list — sourcing is still yours.
4. Send to ~50 first. Check bounces before scaling.
5. Watch `crm_audit_started` and `crm_audit_completed` in PostHog with
   `public: true`. **The started → completed rate is the number the whole model
   rests on** — it needs a CSV export, which is real friction, and every revenue
   estimate assumed 40% without evidence.

## Which numbers are guesses

The capacity and deliverability figures are read from the workspace. The
conversion figures are not: 2–4% of prospects running the audit, and ~15% of
those converting, are assumptions. One week of real data replaces both.
