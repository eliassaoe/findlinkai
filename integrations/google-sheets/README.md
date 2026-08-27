# LinkFinder AI for Google Sheets

Enrich a column of names into emails, phone numbers and LinkedIn URLs, without
leaving the sheet.

---

## Contents

1. [Install it](#install-it)
2. [Enrich a column](#enrich-a-column)
3. [Get the match right — the four columns](#get-the-match-right--the-four-columns)
4. [The `=LINKFINDER()` formula](#the-linkfinder-formula)
5. [Every lookup, and what it costs](#every-lookup-and-what-it-costs)
6. [Large sheets](#large-sheets)
7. [When something goes wrong](#when-something-goes-wrong)
8. [For maintainers](#for-maintainers)

---

## Install it

1. In your sheet: **Extensions → Apps Script**
2. Create four files and paste in the contents of each:
   `Operations.gs`, `Code.gs`, `Bulk.gs`, `Sidebar.html`
3. **Project Settings → Show `appsscript.json`**, and replace it with the one here
4. Close the editor and reload the sheet — a **LinkFinder AI** menu appears
5. **LinkFinder AI → Set API key…** and paste the key from
   [linkfinderai.com/api-access](https://linkfinderai.com/api-access)

Your key is stored against your Google account, not the document. Sharing the
sheet does not share your key or spend your credits — everyone enriching from it
sets their own.

---

## Enrich a column

**LinkFinder AI → Enrich a column…**

Pick the lookup, say which columns to read and which to write into, and press
**Enrich column**. You can close the panel; the run keeps going.

Rows that already have a value in the target column are skipped without calling
the API, so **re-running a range is free for anything already filled in**. That is
also what makes a stopped run safe to restart.

---

## Get the match right — the four columns

This is the part worth reading.

The two name-based lookups — **Find Email from Name** and **Find LinkedIn URL
from Name** — read up to **four** columns, not one:

| Column | Required | Why it matters |
| --- | --- | --- |
| **Full Name** | Yes | The person |
| **Company** | No | The strongest signal after the name |
| **Location** | No | Separates two people with the same name and employer |
| **Job Title** | No | Separates them again when location does not |

They get joined into a single lookup, empty ones dropped:

```
Bill Gates + Microsoft + Seattle + Co-chair
  → "Bill Gates Microsoft Seattle Co-chair"
```

**Fill in as many as you have.** "John Smith" on its own matches thousands of
people and the result is close to a coin flip. "John Smith Acme Berlin VP Sales"
matches one. The credit cost is identical either way — the only thing that
changes is whether you get the right person.

### "Doe, John" is handled

CRM exports love `Last, First`. A name in that form is flipped to `John Doe`
before the lookup. A comma anywhere else — a company like `Gates, Foundation` —
is left exactly as it is.

### Rows without a name are skipped, not charged

If the Full Name cell is empty, the row is skipped even when company and location
are filled in. A company and a city is not a person, and charging for that lookup
would be charging for a guess.

---

## The `=LINKFINDER()` formula

For a handful of cells, or when you want the result to recalculate.

```
=LINKFINDER(A2, "company_name_to_website")
```

The value comes first, the lookup second — the order this integration has always
used. The name-based lookups take three more after that, all optional:

```
=LINKFINDER(A2, "lead_full_name_to_email", B2, C2, D2)
=LINKFINDER(A2, "lead_full_name_to_email", B2)          ← name + company only
```

Fill down like any formula.

Two things to know about custom functions in Sheets:

- Google **caches** the result of a formula with unchanged arguments. That is
  usually what you want — it means a recalculation does not re-charge you — but
  it also means editing the row is what refreshes it.
- They time out after 30 seconds. **Get LinkedIn Profile Details** routinely takes
  longer; use *Enrich a column* for that one, which waits up to 90 seconds.

---

## Every lookup, and what it costs

Costs are **not** uniform, and a sheet is exactly where that bites — 1,000 rows of
the wrong lookup is a real bill.

| Lookup | Reads | Credits per row |
| --- | --- | --- |
| Find LinkedIn URL from Name | name, company, location, job title | **1** |
| Find Company Website / Phone / Email / LinkedIn URL / Employee Count | company name | **1** |
| Get Employee Count from LinkedIn Company | company page URL | **1** |
| Get LinkedIn Post Reactions | post URL | **1** |
| Look Up an Instagram Profile | handle or URL | **1** |
| B2B Data Lookup | anything | **1** |
| Find LinkedIn URL from Email | email | **5** |
| Get LinkedIn Company Details | company page URL | **6** |
| **Find Email from Name** | name, company, location, job title | **7** |
| Find Email from LinkedIn Profile | profile URL | **10** |
| Get LinkedIn Profile Details | profile URL | **10** |
| **Find Phone from LinkedIn Profile** | profile URL | **50** |
| Employee lists, Find Leads with AI | company / description | 0.5 per record returned |

The panel multiplies the cost by your row count **before** you start, and warns on
anything at 7 or above.

**Every row is charged, including rows that find nothing** — those get `Not found`
written into them so you can see the difference between "no answer" and "not run
yet".

---

## Large sheets

Apps Script kills any script at six minutes, which a few thousand rows will always
exceed. The run stops at 4.5 minutes, saves its position, and schedules itself to
continue a minute later. You will see it pause and resume; that is working as
intended, and nothing is looked up twice.

**LinkFinder AI → Stop a running job** halts it after the row in progress.
Restarting later picks up where it left off, because filled rows are skipped.

---

## When something goes wrong

The error is written into the row rather than stopping the run, so one bad input
never strands the rows after it.

| What you see | What it means |
| --- | --- |
| `Not found` | The lookup ran and found nothing. Charged. Add company/location and retry. |
| `Error: Out of credits…` | The run **stops** — this will not fix itself on the next row. |
| `Error: …API key was rejected` | Also stops. Set the key again from the menu. |
| `Error: Rate limited…` | Slow down and continue; the row can be re-run. |
| `Error: …provider error…` | A fault on LinkFinder's side, not your input. Credits were still spent. |
| `Error: …still running after 90 seconds` | A slow lookup. Re-run just that row. |

To retry a row, clear its result cell and run the same range again — everything
else is skipped.

---

## For maintainers

`Operations.gs` is **generated**. It comes from
[`integrations/catalog/operations.json`](../catalog/README.md), which is built
from the root `openapi.json`, so the lookups and their costs cannot drift from the
API:

```bash
node build.mjs          # regenerate Operations.gs
node --test test/       # the input-building tests
```

The composite-input behaviour mirrors `app.html`'s own `lfBuildCsvData` — the same
join, the same `Last, First` flip. `test/input.test.mjs` pins it. If you change one,
change both.
