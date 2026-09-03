# Submitting the Chrome extension

Everything up to the upload is done and reproducible. The upload itself needs a
human once, for reasons that are Google's, not ours.

## What is already true

- `node pack.mjs` produces `linkfinder-ai-extension-0.1.0.zip` — 16 files, 18 kB.
- Manifest V3, one permission (`storage`), one host permission
  (`api.linkfinderai.com`), content script scoped to `www.linkedin.com`.
- 29 committed tests pass in the repo suite (`cd integrations && npm test`).
- Driven end to end in real Chromium: 22 checks, all passing (procedure below).

## What a human has to do

**1. A developer account, once — $5.**
<https://chrome.google.com/webstore/devconsole> → accept the developer agreement
and pay the one-time registration fee. This cannot be automated and it cannot be
done by an agent: the agreement has to be accepted by a person, and the fee needs
a card.

**2. Upload.**
Dashboard → **Add new item** → drop in the zip from `node pack.mjs`.

**3. Fill the listing.** Prepared copy:

> **Name** — LinkFinder AI — LinkedIn phone number & email finder
>
> **Summary (132 char max)** — Find the phone number or email behind any
> LinkedIn profile, and export a company's employees to CSV.

Phone leads the name deliberately. Over 90 days the phone landing page converted
**86.8%** of its visitors into a lookup against email's **13.0%** — 6.7x the
intent — and `linkedin_profile_to_phone` returns something ~100% of the time, so
a 50-credit lead-in is safe. Apollo, Hunter and Lusha all lead on email, which
makes phone both the differentiator and the less contested store search term.
The reasoning and the numbers are in `docs/chrome-extension-direction.md`.
>
> **Category** — Workflow & Planning
>
> **Description** — see the first two sections of `README.md`; they are written
> to be pasted.

**4. Screenshots.** — **done.** Three at 1280x800 in `store-assets/`:

| File | Shows |
| --- | --- |
| `1-connect.png` | The connect screen a new install sees |
| `2-phone-found.png` | A phone number found on a profile, with the cost shown |
| `3-employee-export.png` | The employee export and its CSV download |

Every value in them is invented, and that is the right call rather than a
compromise: a store screenshot showing a real person's real phone number would
publish someone's personal data on a public page. (This corrects an earlier note
in this file that said they should be real lookups on a real profile — for a
contact-data tool specifically, they should not be.)

They also carry no third-party branding, only our own UI on a neutral profile
layout.

**5. Privacy disclosures.** The form asks what data you handle; answer:

| Field | Answer |
| --- | --- |
| Single purpose | Look up contact data for the LinkedIn page the user is viewing. |
| `storage` justification | Stores the user's own LinkFinder API key locally. |
| Host permission justification | Sends the lookup to the LinkFinder API. |
| Remote code | **No** — everything is in the package. |
| Data collected | Nothing is collected by the extension. The LinkedIn URL the user chooses to look up is sent to `api.linkfinderai.com`. No analytics, no tracking, no sale of data. |

You will also need a privacy policy URL. `https://linkfinderai.com/privacy`
exists and covers this.

**6. Submit for review.** First review is typically a few days. A rejection is
almost always the permission justifications or a missing privacy policy — not
the code.

## After it is live

Flip the extension's badge on `integrations.html` from "Rolling out" to "Live",
the same as every other integration.

## Re-running the browser verification

Not committed, because it needs Playwright and a browser binary the repo does
not otherwise depend on. To repeat it:

```bash
mkdir /tmp/extcheck && cd /tmp/extcheck && npm init -y && npm i playwright-core
# Chromium is at /opt/pw-browsers/chromium-*/chrome-linux/chrome in this sandbox
```

The harness stands up a local HTTP server as a mock API and copies `src/` to a
temp dir with **only** the API base and the matching host permission rewritten to
that server — `context.route` cannot intercept an extension service worker's
fetch, and `api.linkfinderai.com` is blocked from a sandbox anyway. Every other
line under test is the code that ships.

What it covers, all passing as of 2026-09-03:

- service worker registers; options page saves a key; all 7 costs listed
- panel injects on a profile; three operations offered; costs on the buttons
- lookup posts the right `type`, the canonical URL, and `Bearer <saved key>`
- the key is absent from the page DOM and the page cannot reach extension storage
- copy button confirms
- an async operation takes the 202 path, polls `/status/…`, renders the result
- a `null` result is disclosed as **still charged**
- 401 says re-paste the key; 402 names the credit problem
- a company page offers the company operations, not the profile ones
- `history.pushState` re-renders the panel for the new page type
- no panel on `/feed/`
- the popup reports state truthfully

One bug was found this way and fixed: a transport failure (offline, blocked host)
surfaced as the generic "Something went wrong running that lookup." It now says
"Could not reach LinkFinder. Check your connection and try again." Two tests pin
that.
