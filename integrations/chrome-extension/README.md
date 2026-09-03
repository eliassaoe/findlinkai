# LinkFinder AI — Chrome extension

The lookup where the work happens: you are already standing on a LinkedIn
profile, so the email should be one click away rather than a copy-paste into a
web app.

The three highest-traffic pages on the marketing site are
`/linkedin-phone-number-finder`, `/linkedin-email-finder` and
`/linkedin-search-by-email` — about 2,000 people a month whose job is "get the
contact behind this profile". This is that job, in the place it happens.

## What it does

A small panel, bottom-right, on any LinkedIn profile, company page or post. It
offers exactly the operations whose input is the URL you are on:

| Page | Operations |
| --- | --- |
| `/in/…` | Email (10), LinkedIn Profile Details (10), Phone (50) |
| `/company/…` | Employee Count (1), Employees (1 + 0.5 each), Company Details (6) |
| `/posts/…` | Post Reactions (1) |

Every button shows its credit cost before you press it, and a lookup that finds
nothing says **"this lookup was still charged"** — because per `openapi.json` it
is. Discovering that from your balance instead is how a tool earns a one-star
review.

## Install it unpacked (for development)

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select `integrations/chrome-extension/src`
3. It opens the options page on first install. Paste an API key from
   <https://linkfinderai.com/app>.
4. Open any LinkedIn profile.

## The operation list is generated

`src/generated/operations.js` comes from `integrations/catalog/operations.json`
via `build.mjs`, like every other integration in this repo. Do not edit it.

The set is **derived, not listed**: an operation qualifies if its catalog input
label is a LinkedIn URL. So a new LinkedIn operation added to the catalog shows
up here on the next build with nobody remembering to, and an operation needing
input the page cannot supply (a name, an email, a company domain) is excluded by
the same rule — which is why there is no deny-list to maintain either.

    cd integrations && npm run build && npm test

## Where the API key lives, and why that matters

`openapi.json` says of the bearer token: *"Server-side only — never expose it
client-side."* An extension cannot be server-side, so this does the strongest
thing available instead:

- The key is written only by `options.js`, into `chrome.storage.local`.
- It is read only by the service worker (`background.js`).
- The content script never sees it. It asks the worker for a lookup by operation
  type and URL; the key is never in a message, never in the DOM, and not
  reachable by linkedin.com's own scripts. A test asserts all three.
- Exposure is therefore scoped to the one person whose key it already is.

## Permissions, and why they are this short

    "permissions":      ["storage"]
    "host_permissions": ["https://api.linkfinderai.com/*"]
    content script on   https://www.linkedin.com/*

No `tabs`, no `activeTab`, no `scripting`, no `<all_urls>`. Permission creep is
the main reason a Web Store listing sits in review, so a test fails if any of
those appears.

The popup needs to know which page you are on without permission to read tab
URLs. It asks the service worker, which knows only because each content script
reports its own `location.href`. `chrome.tabs.query` is used for the tab **id**
only — that works without the `tabs` permission, which merely redacts `url` and
`title`. Do not add `tabs` to "fix" it.

## Two LinkedIn-specific decisions

**Nothing is injected into LinkedIn's markup.** The panel is our own
fixed-position element. Extensions that graft a button into LinkedIn's action bar
break on their next deploy, because those class names are compiled hashes. A
floating panel is less elegant and it survives.

**The URL is watched, not trusted once.** LinkedIn is a single-page app, so
moving between profiles does not reload the page. The panel re-renders on URL
change; a browser test covers `history.pushState`.

Profile URLs are canonicalised before they are sent — query strings, hashes and
sub-tabs like `/recent-activity/all/` are stripped. Country subdomains
(`fr.linkedin.com`, `in.linkedin.com`) are deliberately left alone: rejecting
those was a real bug the win-back campaign had to apologise for.

## Tests

`test/extension.test.mjs` runs in the repo suite with no browser and no
dependencies — 29 tests over generation drift, credit costs against the spec,
manifest minimalism, icon bytes, key isolation, and every documented API
response including 401/402/422/429, async polling, poll expiry, the bounded poll
budget, a non-JSON body, and a transport failure.

It has also been driven end to end in real Chromium — extension loaded, key
saved through the options page, panel injected on a served LinkedIn URL, lookups
against a local mock API, 22 checks including async polling, the charged-but-empty
disclosure, SPA navigation and key non-leakage. That harness needs Playwright and
a browser binary, which the repo does not depend on, so it is not committed; the
procedure is in `SUBMITTING.md`.

## Icons

`make-icons.mjs` renders `src/icons/*.png` from the same mark as the n8n node
(rounded blue square, magnifying glass). It is a generator rather than four
committed binaries so the mark stays editable in one place — change the geometry
or `BLUE` and re-run. Chrome will not accept an SVG icon in a manifest, which is
why they are rasterised at all.

## Packing for the store

    node pack.mjs

Rebuilds the generated files, refuses to pack if that changed anything
committed, and writes `linkfinder-ai-extension-<version>.zip`. Submission steps
are in `SUBMITTING.md`.
