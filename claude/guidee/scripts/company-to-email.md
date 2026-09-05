# Find A Company's Contact Email With LinkFinder AI

| | |
| --- | --- |
| **Slug** | `company-to-email` |
| **Target page** | `email-extractor-from-website.html` |
| **Enrichment** | Company Name -> Company Email |
| **Demo data** | `Salesforce` single · `companies-50.csv`, one column `company_name`, 50 rows (Microsoft, Tesla, Salesforce, and 47 more well-known names) |
| **Length** | 24 steps, ~2 min 40 s |
| **Title score** | 94/100 (`vidiq_score_title`, type long, channel UCAq5URh_O2gbg4bFFwBWfdg) |
| **Written** | by hand from `template.md` — no resources page for this flow to derive from |

## Cover

> In this video we are going to see how to find a company's contact email address using LinkFinder AI.

## Before you record

- Put `companies-50.csv` on the Desktop, at the top of the file dialog, before you start.
- Have the finished export already open in a spreadsheet in another window for step 01 — do not build it on camera.
- Type `Salesforce` in one go into the company name field. A pause mid-field becomes two steps in the Guidde output (see STYLE.md fix #3).

## Click script

Rehearse this end to end first. Every `Target` label below is taken verbatim from `app-ui.md` — do not invent labels.

| # | Action | Target | Type |
| --- | --- | --- | --- |
| 01 | Hold | finished export open in a spreadsheet, Email column filled for every row | — |
| 02 | Click | first link in the video description | — |
| 03 | Click | `Start Free Trial` | — |
| 04 | Click | `I have` | — |
| 05 | Select | `Company Name` | — |
| 06 | Click | `I want to find` | — |
| 07 | Select | `Company Email` | — |
| 08 | Fill | `Enter Company Name` | `Salesforce` |
| 09 | Click | `Enrich Data` | — |
| 10 | Hold | result panel showing the returned email | — |
| 11 | Click | `Copy` next to the email | — |
| 12 | Click | `Bulk` | — |
| 13 | Click | `Upload CSV (bulk)` | — |
| 14 | Click | `Select File` | — |
| 15 | Click | `companies-50.csv` on the Desktop, then confirm | — |
| 16 | Hold | column preview showing `company_name` mapped | — |
| 17 | Click | `Process 50 items` | — |
| 18 | Hold | progress running | — |
| 19 | Hold | completed run, filled rows visible | — |
| 20 | Click | `Export CSV` | — |
| 21 | Hold | downloaded file opening in the spreadsheet | — |
| 22 | Hold | credit balance in the header | — |
| 23 | Click | `Buy Credits` | — |
| 24 | Closing card | — | — |

## Step cards

**01 What You End Up With**
> Fifty company names went in, and this came back — every row with a contact email address next to it. Here is how, in under three minutes.

**02 Open LinkFinder AI**
> Click the first link in the video description to open LinkFinder AI.

**03 Create Your Free Account**
> Click Start Free Trial. You get free credits on signup, which covers the single lookup you are about to see.

**04 Open the Input Dropdown**
> On your dashboard, open the I have dropdown.

**05 Choose Company Name**
> Select Company Name — the only input this pairing needs.

**06 Open the Output Dropdown**
> Open I want to find.

**07 Choose Company Email**
> Select Company Email. This pairing costs one credit per company, the cheapest lookup on the platform.

**08 Type A Company Name**
> Enter a real company name, like Salesforce. Prove the pairing works on one company before you spend credits on fifty.

**09 Click Enrich Data**
> LinkFinder AI returns a contact email tied to that company's own domain, not a generic guess.

**10 Confirm the Result**
> There is the email. That is the same lookup the bulk run performs on every row of your file.

**11 Copy It**
> Click Copy to grab the email straight from the result panel.

**12 Switch to Bulk**
> Click Bulk. Your input and output selections carry across, so the run does exactly what you tested.

**13 Open the CSV Uploader**
> Click Upload CSV (bulk).

**14 Choose Your File**
> Click Select File.

**15 Select Your List**
> Pick your CSV. One column of company names is all the file needs — no template to match.

**16 Check the Column Preview**
> Confirm the column it picked up is the one holding your company names. This is the last point before credits are spent.

**17 Start the Run**
> Click Process 50 items. Every row is enriched with the pairing you tested on Salesforce.

**18 Let It Run**
> Rows fill in as they resolve. You can leave the tab — the run does not depend on this window staying open.

**19 Review What Came Back**
> Rows that resolved carry an email. Rows that did not are left empty and cost you nothing, so your credit spend tracks results, not attempts.

**20 Export the Results**
> Click Export CSV.

**21 Open the File**
> Your original columns come back untouched, with the email added alongside — ready to import straight into your CRM or your sequencer.

**22 Check What It Cost**
> Your balance dropped by the number of companies that actually returned an email, not by the fifty you submitted.

**23 Top Up When You Need To**
> Click Buy Credits.

## Closing card

**24 Enrich Your Own List**
> Export a list of company names from your CRM and run it through the same flow — the free credits on signup are enough to prove it on your own data before you pay anything.

## YouTube

**Title:** Find A Company's Contact Email With LinkFinder AI

**Description:**

```
Full guide → https://linkfinderai.com/email-extractor-from-website

Turn a plain company name into a working contact email — no LinkedIn profile
needed, no guessing at name@domain.com patterns. Test the pairing on one
company, then run a whole CSV of company names through the same flow and
export every row with an email next to it.

You are charged only for companies that actually return an email, so empty
rows cost nothing.

00:00 What 50 enriched companies look like
00:14 Creating a free account
00:28 Testing the pairing on one company (Salesforce)
01:00 Switching to bulk and uploading your CSV
01:40 The run, and what comes back
02:15 Exporting, and what it actually cost

Free credits on signup — enough to run this on your own list.

#leadgeneration #b2bsales #emailfinder #dataenrichment #salesops
```

## Embed snippet

Paste into `email-extractor-from-website.html`, matching how the existing
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

Generated with `vidiq_voiceover_generate`, voice `iP95p4xoKVk53GoZ742B`
(Chris — Charming, Down-to-Earth), the fixed voice per `METHOD.md`. Covers
the cover line and all 24 step cards read in order.

- File: `claude/guidee/audio/company-to-email-vo.mp3`
- Duration: 141.6s (2:22) — the click script targets ~2:40 for the full
  video once card hold-times and the demo footage are cut in, so this
  leaves headroom rather than needing a trim.
- 2,194 characters synthesized.

This is a full read of the narration for reference/pacing. Once the Guidde
recording exists, re-cut this against the real footage in Descript per the
production chain in `METHOD.md` — do not treat this file as the final mix.
