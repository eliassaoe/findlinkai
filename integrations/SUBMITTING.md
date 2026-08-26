# Shipping each integration

What is automated, what needs a credential, and what a human has to click.

Nothing here is live until these are done — the badges on `integrations.html` say
"Rolling out" for exactly that reason, and should be flipped to "Live" per integration
as each one lands.

---

## 1. n8n node → npm  ·  ready to go

**Fully automated. No new credentials if `NPM_TOKEN` is already set.**

Actions → **Publish n8n node** → Run workflow → `dry_run: false`.

The dry run has already passed on this branch: `npm ci`, build, lint and pack all
succeed, and `n8n-nodes-linkfinderai@0.2.0` is confirmed not yet on npm.

The workflow refuses to publish a version already on the registry — npm version numbers
can never be reused, so that check is what stops one being burned by accident.

After publishing, the node appears in n8n under **Settings → Community Nodes** as
`n8n-nodes-linkfinderai`. Verified n8n installs get it in the node panel directly.

---

## 2. Nango CRM actions → your Nango account  ·  needs one secret

**Secret:** `NANGO_SECRET_KEY_PROD` — Nango dashboard → Environment Settings → Secret Key.
Add it under repo Settings → Secrets and variables → Actions.

Then: Actions → **Publish integrations** → `target: nango`, `dry_run: false`.

Deploys all 18 actions (6 CRMs × enrich-contact / enrich-company / check-linkfinder-job).
`npx nango compile` already passes in CI, so the deploy is the only untested step.

Each CRM also needs an **integration configured in the Nango dashboard** with its OAuth
app credentials before connections can be made — Nango cannot infer those. The scopes
each action needs are declared in `nango-integrations/shared/adapters/*.ts`.

---

## 3. Zapier → marketplace  ·  needs one secret and one manual registration

**Secret:** `ZAPIER_DEPLOY_KEY` — zapier.com → Settings → Deploy Keys.

**One-time, must be done by a human once** (it creates the app under your Zapier
account and cannot be done from CI):

```bash
cd integrations/zapier
npm install
npx zapier login
npx zapier register        # creates the app, writes .zapierapprc
git add .zapierapprc && git commit -m "Register the Zapier app"
```

After that: Actions → **Publish integrations** → `target: zapier`, `dry_run: false`
pushes each new version.

**A pushed version is private.** Making it public is two deliberate steps in Zapier's UI:

1. `npx zapier promote 1.0.0` — makes the version the default for existing users
2. Submit for **marketplace review** from the Zapier developer dashboard

Zapier's review checks that **sample output matches real API responses**. Four of the
five result families in `catalog/overlay.json` were captured from live calls;
`linkedin_post_to_reactions` was not. Call it once and reconcile before submitting.

The app already passes Zapier's own schema validation — that runs in CI on every push
(the `Zapier app` job), so a rejection on schema grounds surfaces in seconds instead of
days into a review queue.

---

## 4. Make → marketplace  ·  manual, and deliberately not automated

Make has no stable public API for app submission — the supported path is their VS Code
extension or the app editor in the UI. Automating it against an undocumented endpoint
would be a workflow nobody could trust, so this one stays a documented manual step.

1. Install the **Make Apps Editor** extension for VS Code
2. Log in with an API token (Make → Profile → API access)
3. Create a new app and import from `integrations/make/`:
   - `app.json` → app metadata
   - `general/base.imljson` → base
   - `connections/linkfinderai/` → connection
   - `modules/<key>/` → one module each, 20 of them
4. Run each module once against a real key
5. Request review from the Make partner portal

**Import it and run each module before submitting.** The IML (`repeat`, `condition`,
`temp`) follows Make's documented semantics but has never been executed in Make itself —
that is the one part of this integration with no test behind it.

---

## 5. Google Sheets add-on  ·  manual, scope depends on ambition

**For internal use** — paste the four files from `integrations/google-sheets/` into
Extensions → Apps Script on a sheet. Working in minutes. See that folder's README.

**For public listing** on the Google Workspace Marketplace, Google requires a GCP
project, an OAuth consent screen, and a **security assessment** because the add-on
touches spreadsheet content. That is a weeks-long process with real cost, and worth
starting only once the internal version shows the demand is there.

---

## 6. Outreach connectors  ·  library code, not a product

`integrations/outreach/` is a dependency-free ES module, not something to submit
anywhere. It gets wired into a worker or backend that calls `enrichAndPush()`.

Instantly's field names are confirmed against its endpoint spec. The other eleven were
written from published documentation — the tests pin the exact request each builds, but
nothing has confirmed each vendor accepts it. **Run one lead through each destination
before pointing a real campaign at it.** Salesforge and EmailBison need the most care;
EmailBison is self-hosted, so its paths vary per deployment.
