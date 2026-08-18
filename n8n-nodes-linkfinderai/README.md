# n8n-nodes-linkfinderai

An [n8n](https://n8n.io) community node for [LinkFinder AI](https://linkfinderai.com) —
turn a name, email, company, or LinkedIn/Instagram URL into contact and company data,
directly inside a workflow. No more wiring up the HTTP Request node by hand.

This wraps LinkFinder AI's single-endpoint API (`POST https://api.linkfinderai.com`,
one `type` field per operation — see the [API docs](https://linkfinderai.com/api-documentation))
into proper n8n Resource/Operation dropdowns, with built-in handling for the API's
sync/async split (most lookups resolve inline; `linkedin_profile_to_linkedin_info`
is always async and returns a job to poll).

## What's included

- **Credentials** — `LinkFinder AI API`, just an API key (find it in your dashboard
  under Settings → API Key). Includes a live credential test.
- **Node** — `LinkFinder AI`, covering all 16 operations across 6 resources:
  - **Lead**: Find Leads (AI search), Full Name → LinkedIn URL, Email → LinkedIn URL
  - **Company**: Name → Website / Phone / Email / Employee Count / LinkedIn URL, Domain → Employees
  - **LinkedIn Profile**: URL → Full Info (async), URL → Email, URL → Phone
  - **LinkedIn Company**: URL → Info, URL → Employee Count
  - **LinkedIn Post**: URL → Reactions
  - **Instagram**: Profile URL → Info
  - **Job**: Check Status — poll a job by `Job ID` or `Poll URL`

### How the async handling works

Every operation has a **Wait for Completion** option (on by default). When a call
comes back with a `job_id` instead of an immediate result, the node polls
internally — growing delay, capped wait window (`Max Wait Time`, default 25s;
60s for `linkedin_profile_to_linkedin_info`, since that one is *always* async
and 25s usually isn't enough).

If the deadline passes before the job finishes, the node returns
`{ processing: true, job_id, poll_url }` instead of failing. Wire that into an
n8n **Wait** node followed by a **LinkFinder AI → Job → Check Status** node,
looping until `processing` is `false` — the same pattern documented for
[Zapier/Make](https://linkfinderai.com/api-documentation#async) and used by
LinkFinder's own [HubSpot integration](../nango-integrations/README.md).

Turning **Wait for Completion** off skips the internal poll entirely and always
returns the job info immediately, if you'd rather build the wait loop yourself
from the start.

## Local development / testing

This hasn't been run against a live n8n instance from this environment — do
that before publishing. n8n's own guide for testing a community node locally:
https://docs.n8n.io/integrations/creating-nodes/test/run-node-locally/

```bash
cd n8n-nodes-linkfinderai
npm install
npm run build          # tsc + copies the icon into dist/
npm link                # registers this package globally

# in your n8n install / ~/.n8n:
npm link n8n-nodes-linkfinderai
n8n start
```

Then in the n8n UI: add a **LinkFinder AI** node, create the credential with a
real API key, and try a cheap operation first (e.g. Company → Name → Website)
before testing the async LinkedIn profile lookup.

## Publishing

Once verified locally:

```bash
npm run build
npm publish   # package name must stay prefixed "n8n-nodes-" for n8n's
              # community-node installer/search to find it
```

After publishing, submit it to n8n's [verified community nodes program](https://docs.n8n.io/integrations/creating-nodes/build/create-n8n-nodes-package/#submit-your-node-for-verification-by-n8n)
so it shows up as a first-class result in n8n's in-app node search rather than
requiring users to install it by exact package name.

## Notes / things to double-check before publishing

- `credentials/LinkFinderAiApi.credentials.ts`'s `test` request calls
  `company_name_to_website` with `"Tesla"` — that's a real 1-credit call against
  production, used only when a user clicks "Test" on the credential. Confirm
  that's the credit-cost tradeoff you want for a credential test.
- Error messages in `assertOk()` are deliberately generic per HTTP status
  (401/402/422/429/5xx) rather than always surfacing the API's `message` field —
  adjust if you'd rather always pass the raw API message through.
- No rate-limit-aware batching across items yet — a workflow item list of, say,
  200 rows will fire 200 sequential requests (with the built-in 429 backoff per
  request, but no concurrency control). Fine for typical workflow sizes; worth
  revisiting if this becomes a common complaint.
