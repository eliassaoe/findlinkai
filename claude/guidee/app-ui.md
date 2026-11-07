# App UI ground truth

Extracted from `app.html` (`dataConfigurations`, ~line 1488). Click scripts
must only reference labels that appear here — invented labels are the fastest
way to make a recording session fail.

## The enrichment form

Three controls, in this order:

1. **`I have`** — dropdown, placeholder `Select data type...`
2. **`I want to find`** — dropdown, placeholder `Select output type...`
   (disabled until the first dropdown is set)
3. The input field, whose label and placeholder change per selection
4. **`Enrich Data`** — submit button

Mode toggle under the dropdowns: **`Single lookup`** (first, selected on
load) / **`📤 Upload CSV (bulk)`** (second). The app **opens in single**; it
opened in bulk from 2026-10-09 to 2026-10-31 and was rolled back
(`docs/bulk-first-default.md`, "Result"), so a storyboard that shows a list
must click **`Upload CSV (bulk)`** first.
Bulk path: **`Upload CSV (bulk)`** -> **`Select File`** -> **`Process N items`**
-> **`Export CSV`**.

Quick-start area (above the dropdowns, hidden after the first click): heading
`Enrich a list — pick what you have, then drop your CSV`, four cards that set
the pair and open the drop zone (`Names → LinkedIn URLs`,
`LinkedIn URLs → Emails`, `Emails → LinkedIn profiles`,
`LinkedIn URLs → Phone numbers`). There is no single-lookup shortcut there.

## Valid input -> output combinations

There are exactly 14. A dropdown pair outside this list does not exist.

| `I have` | Field label | Placeholder | `I want to find` |
| --- | --- | --- | --- |
| Lead Full Name | Enter Lead Full Name + Company Name | `e.g., John Doe JP morgan, Sarah Smith Netflix` | LinkedIn Profile URL |
| Lead Full Name (Verified Email only) | Three separate fields: `First Name` (`e.g., Sarah`), `Last Name` (`e.g., Johnson`), `Company Domain` (`e.g., tesla.com`) — a domain, not a company name; both names must be a single word | — | Verified Email |
| Company Name | Enter Company Name | `e.g., Tesla, Apple, Microsoft` | Company Website · Company Phone Number · Company LinkedIn URL · Company Email |
| Email Address | Enter Email Address | `e.g., john.doe@company.com` | LinkedIn Profile URL |
| Company Domain | Enter Company Domain | `e.g., tesla.com, apple.com` | Company Employees List |
| LinkedIn Company URL | Enter LinkedIn Company URL | `e.g., linkedin.com/company/tesla` | LinkedIn Company Data · Employee Count |
| LinkedIn Profile URL | Enter LinkedIn Profile URL | `e.g., linkedin.com/in/john-doe` | LinkedIn Profile Data · Phone Number · Email Address |
| LinkedIn Post URL | Enter LinkedIn Post URL | `e.g., linkedin.com/feed/update/urn:li:activity:1234567890` | Post Reactions |

## Bulk CSV column requirements

The uploader's expected columns change with the active pairing, not just
the input type:

- Lead Full Name -> LinkedIn Profile URL: `name` (required), `company`
  (required), `location` (optional), `job_title` (optional).
- Lead Full Name -> Verified Email: `first_name`, `last_name`, `domain`
  (all required) — matches the three-field single-lookup form above.
- Company Domain / LinkedIn Company URL -> Company Employees List:
  the relevant URL/domain column (required), plus optional `department`,
  `seniority`, `employee_count`.
- Every other pairing: one column matching the single-lookup field label.

## Filters (Company Employees List only)

`Department` (All departments, Sales, Marketing, Engineering & Technical,
Finance, Human Resources, Operations, Product, Design, Legal, Consulting,
Education, Information Technology, Medical & Health, Other) ·
`Seniority` (All levels, C-Suite, Founder, Owner, Partner, VP, Director,
Head, Manager, Senior, Entry, Intern) · `Number of employees` ·
`High confidence only`

## Result panel fields

Profile: `Name`, `Job Title`, `Headline`, `Location`, `Company`,
`Connections`, `Followers`, `LinkedIn URL`, `View profile`
Company: `Website`, `Industry`, `Company Size`, `Headquarters`, `Founded`,
`LinkedIn Followers`, `View company page`
Each result row has `Copy`. Feedback prompt: `Very useful` / `Not useful`.

## Under every successful result: the next-step panel

Rendered inside the result, after the value (see `docs/next-step-routing.md`).
Single lookup: heading `That's one row. Your whole list is next.`, a small
spreadsheet with the row just enriched as line 1 and three empty rows, then
four cards: `Upload a CSV` (blue), `Do it in Google Sheets`, `</> Run it from
code` (opens a `curl` snippet with a `Copy` button and the link `docs, MCP
server and key management →`), and either `Send to HubSpot` (connected) or
`Sync to my CRM`. Footer links: `Download this row as CSV`, `2-min walkthrough
of a bulk run`.
After a bulk run: heading `N of M rows enriched. Next time, skip the upload.`
with `Enrich inside Google Sheets`, `</> Automate this run`, and `Send all to
HubSpot` / `Sync to my CRM`.

## Top of the enrichment page: the smart-start box (since 7 Nov 2026)

Heading `Paste what you have. We'll find the rest.`, one input
(placeholder `A LinkedIn profile URL, an email, a person's name or a company`)
and a button whose label follows what was pasted: `Find email` (LinkedIn
profile URL or a name), `Find phone number instead` / `Get full profile` as
links under it for a profile, `Find LinkedIn profile` (email), `Get company
data` (LinkedIn company URL), `Get who reacted` (post), `Find employees`
(domain), `Find website` (company name). Under it: `Got a whole list
instead?` `Upload a CSV` · `Google Sheets` · `API / n8n` · `HubSpot`.
Below the box, one line: `Have a list? Upload a CSV:` with four pair
shortcuts. The four "Popular searches" cards no longer exist.

Under it, `OR PICK WHAT YOU WANT TO FIND` replaces the `I have` / `I want to
find` dropdowns: one block per goal — `Find an email`, `Find a phone number`,
`Find a LinkedIn profile`, `Get company data`, `Get profile data` — each with
cards saying what you start from and the cost, e.g. under `Find an email`:
`From a LinkedIn profile URL` / `10 credits`, `From a name + company domain` /
`7 credits`. The picked card is highlighted. Storyboards that say "select X in
the I have dropdown" must now say "under Find an email, click From a …".

The route chooser (`Where is the data you want to enrich?`) is no longer shown
by default; only `?route_test=1` brings it back.

## Other surfaces

`API & MCP` tab — `API Key`, `MCP Server`, `View API Docs`
`Buy Credits`, `Get Free Credits`, `Referral program`, `Logout`

**Smart-start box (since 7 Nov 2026).** Empty: four "Try:" chips (a LinkedIn
profile, a person's name, an email, a company). After pasting: a green line
"<Type> detected", then one button per result with its credit cost, first one
filled blue (LinkedIn profile → "Find work email 10 credits", "Find phone number
50 credits", "Get full profile 10 credits"). A person's name adds a second field
"Their company domain, e.g. microsoft.com" and two buttons ("Find work email 7
credits", "Find LinkedIn profile 1 credit"). Enter runs the first button.

**Start screen (since 7 Nov 2026, 21:50, replaces the smart-start box above).**
Heading "What do you want to find?", then card groups in this order:
"Find a LinkedIn profile", "Find an email", "Find a phone number",
"Get company data", "Get profile data". Each card shows what you start from
and its credit cost (e.g. "From a name + company · 1 credit"). Under the
cards: "Have a list? Upload a CSV: Names → LinkedIn · LinkedIn → Emails ·
Emails → LinkedIn · LinkedIn → Phones · or Google Sheets". There is no
paste box any more.

**Start screen (since 7 Nov 2026, later — replaces the grouped cards above).**
Heading "What do you want to find?", then four big cards: "Find a LinkedIn
profile / From a name + company / 1 credit", "Find a work email / From a
LinkedIn profile URL / 10 credits", "Find a company website / From a company
name / 1 credit", "Find a phone number / From a LinkedIn profile URL / 50
credits". Under them a "More searches" link (opens the grouped cards) and the
CSV / Google Sheets line. Clicking a card collapses everything into a blue bar
"Find a LinkedIn profile  From a name + company · 1 credit  Try an example  Change";
the form ("Enter Full Name", "Company Name", Location optional, Job Title
optional, button "Enrich Data") is below the "Single lookup / Upload CSV (bulk)"
toggle. "Try an example" fills Satya Nadella / Microsoft but does not run it.

