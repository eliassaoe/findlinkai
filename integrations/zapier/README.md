# LinkFinder AI for Zapier

A Zapier CLI app exposing every LinkFinder AI enrichment as a **search** — one per
operation in the API, generated from `integrations/catalog/operations.json`.

## Why searches and not triggers

LinkFinder is a lookup service: you hand it a name, email, company or LinkedIn URL and
it hands back data. There is no record feed to poll, so there is nothing a trigger
could watch. Searches are the right Zapier primitive, and they compose the way people
actually want them to — a Google Sheets trigger, a LinkFinder search, a write back.

## Build

```bash
npm install
npm run build     # regenerates searches/ from the catalog
npm test
npm run validate  # zapier validate — needs the Zapier CLI and a login
```

`searches/` is generated. Edit `integrations/catalog/overlay.json` (labels, categories,
sample output) or `openapi.json` (operations, credits, async) and re-run the build —
never hand-edit a file under `searches/`.

## Looking someone up by name

The two name searches — **Find LinkedIn URL from Name** and **Find Email from Name** —
take four fields rather than one: **Full Name** (required), **Company**, **Location**
and **Job Title**. They are joined into the single string the API takes, blanks
dropped, which is exactly what the LinkFinder app itself sends.

Map as many as your Zap has. The extra three **cost no additional credits**, and they
are the difference between one match and thousands: `John Smith` matches an enormous
number of people, `John Smith Acme Berlin VP Sales` matches one — and Find Email from
Name is 7 credits a row either way, charged whether it returns the person you meant or
a stranger with the same name.

A name arriving from a CRM as `Doe, John` is reordered to `John Doe` automatically; a
company with a comma in it (`Gates, Foundation`) is left alone. A Zap built against the
older single-field version still works — `input_data` is accepted as a fallback when
none of the four are mapped.

## Why package.json pins `@types/node`

`zapier-platform-cli` pulls in `mem-fs`, which wants `@types/node@^15`, while the
`@inquirer/*` packages alongside it peer-depend on `>=18`. npm resolves that to a
lockfile it then refuses to install: `npm ci` fails with *"lock file's
@types/node@15.14.9 does not satisfy @types/node@26.3.0"*.

The `overrides` entry forces one version and makes `npm ci` deterministic. These are
type declarations with no runtime behaviour, so pinning them cannot affect the app —
and CI runs `npm ci`, so without it nothing here builds on a clean machine.

## Credits

Each search states its real cost in its description, from the catalog. They are not all
1 credit: `Find Phone from LinkedIn Profile` is **50**, `Get LinkedIn Profile Details`
and `Find Email from LinkedIn Profile` are **10**, `Find Email from Name` is **7**.
Employee-list searches bill 0.5 credits per employee returned rather than a flat fee.

**Every call is charged, including one that finds nothing** — a search returning no
results still cost credits. This matters in Zapier more than anywhere else, because a
Zap runs unattended over a whole spreadsheet.

## Asynchronous lookups

`Get LinkedIn Profile Details` always returns a job rather than a result, and any
operation can fall back to a job under load. The app polls for up to 22 seconds, which
keeps it inside Zapier's execution limit, then fails with an explanation rather than
returning an empty result that would read as "nothing found". For lookups that
routinely run longer, the API or the n8n node can wait longer than Zapier allows.

## Connection test

Connecting does **not** run an enrichment — it would charge credits every time Zapier
re-tested the connection. It polls a job id that cannot exist: the status endpoint is
authenticated but free, so a valid key gets a `404` ("no such job") and an invalid one
gets a `401`.

## Before publishing to the Zapier marketplace

The sample outputs in `searches/` come from `overlay.json`, which was derived from
`api-documentation.html` and the app's own result renderers — **not** from live API
responses, because the build environment cannot reach the API. Run each search once
against a real key and reconcile the samples before submitting for review; Zapier's
review checks that samples match real output.
