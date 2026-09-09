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

Mode toggle above the form: **`Single`** / **`Bulk`**.
Bulk path: **`Upload CSV (bulk)`** -> **`Select File`** -> **`Process N items`**
-> **`Export CSV`**.

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

## First visit only: the route chooser

Above `Popular searches`: `Where is the data you want to enrich?` with four
cards — `In a CSV or spreadsheet`, `In Google Sheets`, `In my own code or n8n /
Make`, `In my CRM (HubSpot)` — and the link `I just need one lookup for now`.
It is gone after any choice or any enrichment, so a recording made on a used
account will not show it.

## Other surfaces

`API & MCP` tab — `API Key`, `MCP Server`, `View API Docs`
`Buy Credits`, `Get Free Credits`, `Referral program`, `Logout`
