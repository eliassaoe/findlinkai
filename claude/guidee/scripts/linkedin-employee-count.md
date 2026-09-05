# Get Any Company's Real Employee Count With LinkFinder AI

| | |
| --- | --- |
| **Slug** | `linkedin-employee-count` |
| **Target page** | `find-company-employee-count.html` |
| **Enrichment** | LinkedIn Company URL -> Employee Count |
| **Demo data** | `linkedin.com/company/tesla` single · `companies-linkedin-50.csv`, one column `linkedin_company_url`, 50 rows of well-known companies |
| **Length** | 22 steps, ~2 min 20 s |
| **Title score** | 84/100 (`vidiq_score_title`, type long, channel UCAq5URh_O2gbg4bFFwBWfdg) |
| **Written** | by hand from `template.md` — no resources page for this flow to derive from |

## Cover

> In this video we are going to see how to get any company's real employee count using LinkFinder AI.

## Before you record

- Put `companies-linkedin-50.csv` on the Desktop, at the top of the file dialog, before you start.
- Have the finished export already open in a spreadsheet in another window for step 01 — do not build it on camera.
- Type the LinkedIn company URL in one go — a pause mid-field becomes an extra step in the Guidde output (see STYLE.md fix #3).

## Click script

Rehearse this end to end first. Every `Target` label below is taken verbatim from `app-ui.md` — do not invent labels.

| # | Action | Target | Type |
| --- | --- | --- | --- |
| 01 | Hold | finished export open in a spreadsheet, Employee Count column filled for every row | — |
| 02 | Click | first link in the video description | — |
| 03 | Click | `Start Free Trial` | — |
| 04 | Click | `I have` | — |
| 05 | Select | `LinkedIn Company URL` | — |
| 06 | Click | `I want to find` | — |
| 07 | Select | `Employee Count` | — |
| 08 | Fill | `Enter LinkedIn Company URL` | `linkedin.com/company/tesla` |
| 09 | Click | `Enrich Data` | — |
| 10 | Hold | result panel showing the returned employee count | — |
| 11 | Click | `Bulk` | — |
| 12 | Click | `Upload CSV (bulk)` | — |
| 13 | Click | `Select File` | — |
| 14 | Click | `companies-linkedin-50.csv` on the Desktop, then confirm | — |
| 15 | Hold | column preview showing `linkedin_company_url` mapped | — |
| 16 | Click | `Process 50 items` | — |
| 17 | Hold | progress running | — |
| 18 | Hold | completed run, filled rows visible | — |
| 19 | Click | `Export CSV` | — |
| 20 | Hold | downloaded file opening in the spreadsheet | — |
| 21 | Hold | credit balance in the header | — |
| 22 | Closing card | — | — |

## Step cards

**01 What You End Up With**
> Fifty LinkedIn company pages went in, and this came back — every row with a real, current employee count next to it, not a stale directory number. Here is how, in under two and a half minutes.

**02 Open LinkFinder AI**
> Click the first link in the video description to open LinkFinder AI.

**03 Create Your Free Account**
> Click Start Free Trial. You get free credits on signup, which covers the single lookup you are about to see.

**04 Open the Input Dropdown**
> On your dashboard, open the I have dropdown.

**05 Choose LinkedIn Company URL**
> Select LinkedIn Company URL.

**06 Open the Output Dropdown**
> Open I want to find.

**07 Choose Employee Count**
> Select Employee Count. This one is a flat one credit per company, no matter how large the company is — it is not priced per employee, because you are getting a number back, not a list.

**08 Paste The Company URL**
> Enter a company's LinkedIn page URL, like linkedin.com/company/tesla.

**09 Click Enrich Data**
> LinkFinder AI counts the company's current LinkedIn headcount directly, live off their page.

**10 Confirm the Result**
> There is the number. That is the same count the bulk run performs on every row of your file.

**11 Switch to Bulk**
> Click Bulk. Your input and output selections carry across, so the run does exactly what you tested.

**12 Open the CSV Uploader**
> Click Upload CSV (bulk).

**13 Choose Your File**
> Click Select File.

**14 Select Your List**
> Pick your CSV. One column of LinkedIn company URLs is all the file needs.

**15 Check the Column Preview**
> Confirm the column it picked up is the one holding your company URLs. This is the last point before credits are spent.

**16 Start the Run**
> Click Process 50 items. Every row is counted with the same lookup you tested on Tesla.

**17 Let It Run**
> Rows fill in as they resolve. You can leave the tab — the run does not depend on this window staying open.

**18 Review What Came Back**
> Rows that resolved carry an employee count. Rows that did not are left empty and cost you nothing, so your credit spend tracks results, not attempts.

**19 Export the Results**
> Click Export CSV.

**20 Open the File**
> Your original columns come back untouched, with the employee count added alongside — ready to use for company-size filtering in your CRM.

**21 Check What It Cost**
> Your balance dropped by one credit for every company that actually returned a count, not by the fifty you submitted.

## Closing card

**22 Check Your Own Target List**
> Export a list of LinkedIn company URLs from your CRM and run it through the same flow — the free credits on signup are enough to prove it on your own data before you pay anything.

## YouTube

**Title:** Get Any Company's Real Employee Count With LinkFinder AI

**Description:**

```
Full guide → https://linkfinderai.com/find-company-employee-count

Turn a LinkedIn company page into a current, real employee count — not a
directory number that could be years out of date. Test the pairing on one
company, then run a whole CSV of LinkedIn company URLs through the same
flow and export every row with a headcount next to it.

You are charged only for companies that actually return a count, so empty
rows cost nothing.

00:00 What 50 counted companies look like
00:12 Creating a free account
00:26 Testing the pairing on one company (Tesla)
00:55 Switching to bulk and uploading your CSV
01:30 The run, and what comes back
02:00 Exporting, and what it actually cost

Free credits on signup — enough to run this on your own list.

#leadgeneration #b2bsales #dataenrichment #salesops #firmographics
```

## Embed snippet

Paste into `find-company-employee-count.html`, matching how the existing
video pages do it (see `company-employee-finder.html`):

```html
    <div class="video-embed-wrap">
      <div class="video-responsive">
        <iframe src="https://www.youtube.com/embed/VIDEO_ID" title="LinkFinder AI demo video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe>
      </div>
    </div>
```

Then flip this row to `"status": "live"` in `catalog.json`.

## Voiceover

**Not yet generated.** `vidiq_voiceover_generate` (voice `iP95p4xoKVk53GoZ742B`
— Chris, the fixed voice per `METHOD.md`) returned "Not enough credits" for
this account before this storyboard could be synthesized. The narration
text above is final and ready to synthesize — run it through
`vidiq_voiceover_generate` once the vidIQ account has topped up, and save
the result to `claude/guidee/audio/linkedin-employee-count-vo.mp3`.
