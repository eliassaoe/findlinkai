# Explee reply management — n8n automation

Automates the one thing that does not scale in an outbound campaign: reading every
reply, deciding what it is, and answering the ones worth answering.

## Why this exists instead of an agent doing it live

`api.explee.com` is blocked by the egress policy of the Claude Code environment this
repo is developed in — the request is rejected at the proxy with a 403 before it
leaves the sandbox. An agent session cannot call Explee, read the inbox, or send a
reply. This workflow runs in n8n instead, where there is no such restriction.

Two consequences worth knowing:

- **The endpoint paths in this workflow are placeholders.** The Explee OpenAPI schema
  could not be read, so nothing here guesses at a URL. Every unknown is a literal
  `REPLACE_ME_*` string that fails loudly rather than silently hitting a wrong path.
  Step 1 below fills them in; it takes about five minutes.
- **Everything that is *not* Explee-specific is finished and tested** — the triage
  logic, the safety rails, the drafting prompt, the dedupe store, the approval gate.

## Step 1 — read the API and fill in the blanks

Run these on your own machine (not in a Claude Code web session, which is where the
block applies):

```bash
export EXPLEE_KEY='sk_explee_...'   # use a freshly rotated key

# The quick guide — human-readable, start here
curl -s -H "X-API-Key: $EXPLEE_KEY" https://api.explee.com/public/api/llms.txt

# The full schema — every path, method and response shape
curl -s -H "X-API-Key: $EXPLEE_KEY" https://api.explee.com/public/api/openapi.json > explee-openapi.json

# List just the paths, so you can find the inbox and reply endpoints fast
jq -r '.paths | to_entries[] | "\(.key)  [\(.value | keys | join(","))]"' explee-openapi.json
```

Then call the inbox endpoint once and keep the response — you need its field names:

```bash
curl -s -H "X-API-Key: $EXPLEE_KEY" "https://api.explee.com<INBOX_PATH>" | jq '.' | head -60
```

### What to put in the `Config` node

Open the **Config** node in n8n and replace each `REPLACE_ME_*`:

| Config field | What it is | How to find it |
| --- | --- | --- |
| `inboxPath` | Path that lists replies, e.g. `/public/api/v1/inbox` | The GET path in the schema whose response contains lead messages |
| `inboxArrayField` | JSON path to the array in that response — `data`, `messages`, `data.items`… Leave blank if the response *is* an array | From the `curl \| jq` output above |
| `replyPath` | Path that posts a reply. Use `{threadId}` or `{messageId}` as the placeholder, e.g. `/public/api/v1/threads/{threadId}/reply` | The POST path in the schema for replying |
| `replyBodyKey` | The key the reply text goes under in the POST body — `body`, `message`, `text`… | The requestBody schema for that POST |
| `fieldMap` | Maps Explee's field names to the workflow's. Every value must be a real key from the inbox response (dots allowed for nesting, e.g. `lead.email`) | From the `curl \| jq` output above |

`fieldMap` needs all seven keys: `messageId`, `threadId`, `leadEmail`, `leadName`,
`body`, `campaignId`, `direction`. `direction` is whatever field tells inbound from
outbound — the workflow skips anything whose value contains "out" so it never replies
to your own sent mail. If Explee has no such field, point it at any field that is
always inbound-only and adjust the check in **Guardrails & Dedupe**.

The other Config fields are already set and safe to leave: `autoSend` (`false`),
`maxRepliesPerRun` (`10`), `model` (`claude-opus-5`), `senderName`, `companyContext`,
`bookingLink`.

## Step 2 — import and wire up credentials

1. n8n → **Workflows** → **Import from File** → `n8n-explee-reply-manager.json`.
2. Create two **Header Auth** credentials (Credentials → New → Header Auth):
   - **"Explee API Key"** — Name: `X-API-Key`, Value: your key.
   - **"Anthropic API Key"** — Name: `x-api-key`, Value: your Anthropic key.
3. Open each HTTP node and select the matching credential. The `REPLACE_WITH_*_ID`
   strings in the JSON are placeholders; n8n resolves them by name once you pick.

Never paste either key into the workflow JSON — credentials are stored separately and
are not included when a workflow is exported or shared.

## Step 3 — how it runs

```
Every 10 min
  └─ Fetch Inbox (Explee)
      └─ Extract Messages          normalise field names via fieldMap
          └─ Guardrails & Dedupe   hard filters, rate limit, dedupe store
              └─ Classify Reply    Claude → intent + action + confidence
                  └─ Parse Verdict
                      └─ Should Reply?
                          ├─ yes → Draft Reply → Validate Draft
                          │           └─ Auto-send Enabled?
                          │               ├─ yes → Send Reply → Mark Sent
                          │               └─ no  → Hold for Approval
                          └─ no  → No Action / Needs Human
```

**Intents:** `interested`, `meeting_request`, `question`, `referral`, `not_now`,
`not_interested`, `unclear`.
**Actions:** `reply`, `no_action`, `needs_human`.

## Step 4 — the safety rails, and why each one is there

These are the reason this is safe to point at a live inbox. All are tested by
`test-guardrails.js` (11 cases, all passing):

| Rail | Behaviour |
| --- | --- |
| **Opt-out / legal** | `unsubscribe`, `remove me`, `do not contact`, `GDPR`, `lawyer`, `legal action` → `needs_human`, never auto-replied. Auto-replying to an opt-out is a CAN-SPAM/GDPR problem, not just a bad look. |
| **Auto-responders** | Out-of-office, bounces, "no longer with the company" → `no_action`. Stops the bot talking to a mail server. |
| **Own sent mail** | Anything whose `direction` contains "out" is skipped, so the workflow cannot reply to itself in a loop. |
| **Dedupe** | `messageId` recorded in workflow static data, kept 30 days. A message is replied to at most once. |
| **Rate limit** | `maxRepliesPerRun` (default 10) caps blast radius if a prompt goes wrong. |
| **Confidence floor** | Classifier confidence below 0.7 is downgraded to `needs_human`. |
| **Draft validation** | Empty, over-long, or template-leaking drafts (`REPLACE_ME`, `{{`) are downgraded to `needs_human` and never sent. |
| **Approval gate** | `autoSend: false` routes every draft to **Hold for Approval** instead of sending. |
| **Mark-after-send** | `Mark Sent` runs *after* a successful POST, so a failed send retries next run rather than being lost. |

Run the tests any time you edit the guardrails:

```bash
cd explee && node test-guardrails.js
```

## Step 5 — rolling it out without breaking anything

1. **Leave `autoSend` at `false`.** Run for a few days and read what lands in
   **Hold for Approval**. That is your accuracy sample.
2. Fix the classifier and drafting prompts (in **Guardrails & Dedupe** and
   **Parse Verdict**) against real replies, not imagined ones. Product facts belong in
   `companyContext` — the drafter is told never to invent anything outside it.
3. Only when the drafts are consistently sendable, set `autoSend` to `true` —
   and consider keeping it on for `meeting_request` only at first, by tightening the
   condition in **Auto-send Enabled?**.
4. Add a Slack or email node after **Hold for Approval** and
   **No Action / Needs Human** so a person actually sees them. They are `NoOp` nodes
   right now — deliberately inert placeholders, not oversights.

## Notes

- The model is `claude-opus-5` for both steps. Classification runs at `effort: low`
  and drafting at `effort: medium` to keep cost down. Swap `model` in Config for
  `claude-sonnet-5` if you want cheaper triage — quality on the classify step holds up
  well, drafting less so.
- `output_config.effort` and the `anthropic-version: 2023-06-01` header are current as
  of this writing; if the Anthropic call 400s, that header and the body params are the
  first thing to check.
- **Explee ≠ Instantly.** This repo also has Instantly tooling. They are separate
  platforms with separate inboxes; this workflow only touches Explee.

## If you would rather not use n8n

The same shape works anywhere. The parts that matter are the guardrails and the
approval gate, not the runner:

- **Make.com** — same node structure; use HTTP modules and a Router in place of the IFs.
- **A cron script** — ~150 lines of Python. Port `Guardrails & Dedupe` verbatim; it is
  plain logic with no n8n dependency beyond the static-data store, which becomes a
  SQLite table or a JSON file.
- **A GitHub Action on a schedule** — cheapest option if the volume is low. Same script,
  `on: schedule`, with the dedupe store committed back or kept in Actions cache.
