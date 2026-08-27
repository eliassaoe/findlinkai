# The published Google Sheets add-on

This is the source of **LinkFinder AI for Google Sheets**, the add-on listed on the
Google Workspace Marketplace since 28 January 2026.

Until this directory existed, that source lived in **one Apps Script project in a
Google Drive account and nowhere else** — no version control, no backup, and the
freelancer who wrote it no longer contactable. Deleting that project would have
deleted the add-on. Treat this directory as the master copy from now on: change it
here, run the tests, then paste it into the editor.

## What it does now that it did not before

The published version could do exactly one thing: find a LinkedIn URL from a name
and a company. It now runs **all twenty lookups** in the catalog, and the four
worst bugs in the original are fixed. `FINDINGS.md` lists every one of them with
the code that caused it.

The bug a real user reported — that there was nowhere to put a location or a job
title — is the third one in that list. Name lookups now read four columns.

## The files

| File | |
| --- | --- |
| `Code.gs` | The add-on. Hand-written. |
| `Operations.gs` | **Generated.** The twenty lookups, their prices and their inputs. |
| `Sidebar.html` | The panel. Renders itself from `Operations.gs`, so a new lookup needs no edit here. |
| `Settings.html` | API key. |
| `Help.html` | **Generated.** Prose lives in `build.mjs`; the price table comes from the catalog. |
| `build.mjs` | Regenerates the two generated files. |
| `FINDINGS.md` | What was wrong with the published version. |

`Operations.gs` and `Help.html` come from `integrations/catalog/operations.json`,
the same catalog Zapier, Make, n8n and the CRM connectors are built from. That is
deliberate: a price shown in a spreadsheet that disagrees with the price charged
is worse than no price at all. CI fails if a regeneration changes a committed file.

    cd integrations && npm run build && npm test

## The two projects

There are two, and it is easy to go looking for the code in the wrong one.

| | Where | What lives there |
| --- | --- | --- |
| **Apps Script project** | [script.google.com](https://script.google.com) | **The code** — the files in this directory, plus `appsscript.json` |
| **Google Cloud project** | [console.cloud.google.com](https://console.cloud.google.com) | The **Marketplace listing** — store entry, icons, the OAuth consent screen and its approved scopes, install audience |

Publishing to the Marketplace requires a standard GCP project, which is why one
exists. Nothing in it is code.

**Cloud → script:** APIs & Services → *Google Workspace Marketplace SDK* → *App
Configuration*, which names the Apps Script deployment the listing points at.

**The scopes live on both sides**, which is the reason for the rule further down:
the consent screen in GCP lists the approved scopes, and Apps Script infers scopes
from the code. Adding an Apps Script service makes those two disagree, and the
listing is pulled until Google re-verifies it.

## Deploying a change

The Apps Script project is **standalone** — it is not bound to a spreadsheet, so it
will not appear from inside a Sheet, and it is in the Drive account the add-on was
published from. Open it at [script.google.com](https://script.google.com) →
**My Projects**, then:

1. Paste each file above over its counterpart. `Operations.gs` will not exist yet
   the first time — add it with **+ &rsaquo; Script**. (Or use `clasp`, below.)
2. **Deploy &rsaquo; Manage deployments** — edit the **existing** deployment and pick
   **New version**. Editing the code alone changes nothing for anyone; the editor
   runs *Head*, installed users run the deployment.
   **Never create a new deployment.** A new deployment ID disables the triggers on
   the old one.
3. In the Cloud project: **Marketplace SDK &rsaquo; App Configuration** &rarr; bump the
   version number there. That is the step that actually publishes it.
4. Test in a spreadsheet before you do step 3.

### No review, as long as the scopes do not change

A code-only update needs **no Google review and no reinstall** — users get it
automatically. That is worth stating plainly, because the fear of a review queue is
what makes people put off shipping a fix.

Change the scopes and it becomes a different job: update them in the Marketplace SDK
*and* on the OAuth consent screen, then **submit a new OAuth verification request**,
and users have to re-authorize. That is the slow path, and avoiding it is the entire
reason for the rule below.

- [Update a published add-on](https://developers.google.com/workspace/add-ons/how-tos/update-published-add-on)
- [Update an app listing](https://developers.google.com/workspace/marketplace/manage-app-listing)
- [Configure the Marketplace SDK](https://developers.google.com/workspace/marketplace/enable-configure-sdk)

### Or push it with clasp, instead of pasting

`clasp` is Google's own CLI for Apps Script. It replaces the five copy-pastes with
one command, and it is the difference between a deploy you can repeat and a deploy
you have to concentrate through.

```bash
npm install -g @google/clasp
clasp login                       # opens a browser; nothing to paste anywhere

# Once, to point this directory at the published project:
clasp clone <SCRIPT_ID>           # writes .clasp.json — see below before you run it
```

**Clone into a scratch directory first, not this one.** `clasp clone` pulls the live
files down, and the point of the exercise is to push these ones up. Clone somewhere
temporary, take the `scriptId` out of the `.clasp.json` it writes, then create
`.clasp.json` here by hand:

```json
{ "scriptId": "<SCRIPT_ID>", "rootDir": "." }
```

It is gitignored — it names one specific project, not something every checkout wants.

Then, from this directory:

```bash
clasp push          # uploads Code.gs, Operations.gs and the three HTML files
clasp open          # opens the project to deploy a version
```

`clasp push` will offer to delete `appsscript.json` from the remote if there is no
local copy — **say no.** That manifest is not committed here on purpose (see below),
and losing it is how the add-on's OAuth scopes change without anyone deciding to.
Safer still: `clasp push` only after running `clasp pull` into a scratch clone and
copying the real `appsscript.json` in, untouched.

`clasp` needs the Apps Script API switched on for your account, once, at
[script.google.com/home/usersettings](https://script.google.com/home/usersettings).

`clasp push` uploads the code. It does not deploy it — see steps 2 and 3 above.

Pushing is still not deploying: after `clasp push`, cut a **New version** under
**Deploy › Manage deployments**, or the store keeps serving the old one.

### The one rule that must not be broken

**Do not add an Apps Script service the add-on does not already use, and do not add
an `oauthScopes` block to `appsscript.json`.**

The published manifest has no `oauthScopes` block, so Apps Script infers the scopes
from the code. Everything here uses only `SpreadsheetApp`, `PropertiesService`,
`UrlFetchApp`, `Utilities`, `HtmlService` and `Logger`, and `@OnlyCurrentDoc` is
still at the top of `Code.gs` — so the inferred scopes are unchanged and no
re-verification by Google is triggered. A single call to `DriveApp`, `GmailApp` or
`ScriptApp` widens the scopes, and the add-on is pulled from the store until Google
re-verifies it. A test asserts this; it is not a style preference.

## What is deliberately not here

`appsscript.json` is not committed, because the published manifest was never
captured and writing a plausible one risks someone pasting it over the real one and
changing the scopes. Leave the manifest in the editor alone.

## Known limits

- **Six minutes.** Google kills any add-on run at six minutes. A long run stops at
  five, reports the row it reached, and keeps every answer already written. Roughly
  400–600 rows per run for the synchronous lookups.
- **Async lookups are much slower.** Five of the twenty always return a job and are
  polled for up to a minute each — perhaps 5–10 rows per run, not 500.
- **A miss is charged.** Every row that runs costs its credits whether or not
  anything is found. Rows that already have an answer are skipped and cost nothing,
  which is what makes re-running and resuming safe.
