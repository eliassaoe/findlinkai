# Enrich A Whole CSV Of Leads At Once With LinkFinder AI

| | |
| --- | --- |
| **Slug** | `bulk-csv-enrichment` |
| **Target page** | `bulk-linkedin-enrichment.html` |
| **Enrichment** | LinkedIn Profile URL -> Email Address |
| **Demo data** | `linkedin.com/in/satyanadella` single · `leads-250.csv`, one column `linkedin_url`, 250 rows |
| **Length** | 24 steps, ~3 min |
| **Written** | by hand from `template.md` — there is no resources page for this flow, so nothing to derive from |

## Cover

> In this video we are going to see how to enrich a whole CSV of leads at once using LinkFinder AI.

## Before you record

STYLE.md names the file picker as the reference guidee's worst defect: steps
43–53 are eleven near-duplicate CSV steps, because Guidde faithfully recorded
someone fumbling. Two rules for this recording:

- Put `leads-250.csv` on the Desktop, at the top of the file dialog, before you
  start. One click to select, one to confirm. If the dialog opens somewhere
  else, stop and restart the recording.
- Have the finished export already open in a spreadsheet in another window for
  step 01. Do not build it on camera.

## Click script

Rehearse this end to end first. Type each value in one go — a pause mid-field
becomes two steps in the Guidde output.

| # | Action | Target | Type |
| --- | --- | --- | --- |
| 01 | Hold | finished export open in a spreadsheet, Email column filled | — |
| 02 | Click | first link in the video description | — |
| 03 | Click | `Start Free Trial` | — |
| 04 | Click | `I have` | — |
| 05 | Select | `LinkedIn Profile URL` | — |
| 06 | Click | `I want to find` | — |
| 07 | Select | `Email Address` | — |
| 08 | Fill | `Enter LinkedIn Profile URL` | `linkedin.com/in/satyanadella` |
| 09 | Click | `Enrich Data` | — |
| 10 | Hold | result panel showing the returned email | — |
| 11 | Click | `Bulk` | — |
| 12 | Click | `Upload CSV (bulk)` | — |
| 13 | Click | `Select File` | — |
| 14 | Click | `leads-250.csv` on the Desktop, then confirm | — |
| 15 | Hold | column preview showing `linkedin_url` mapped | — |
| 16 | Click | `Process 250 items` | — |
| 17 | Hold | progress running | — |
| 18 | Hold | completed run, filled rows visible | — |
| 19 | Click | `Export CSV` | — |
| 20 | Hold | downloaded file opening in the spreadsheet | — |
| 21 | Hold | credit balance in the header | — |
| 22 | Click | `Buy Credits` | — |
| 23 | Hold | pack options | — |
| 24 | Closing card | — | — |

## Step cards

**01 What You End Up With**
> Two hundred and fifty LinkedIn URLs went in, and this came back — every row with a verified email next to it. Here is how, in about three minutes.

**02 Open LinkFinder AI**
> Click the first link in the video description to open LinkFinder AI.

**03 Create Your Free Account**
> Click Start Free Trial. You get free credits on signup, which covers the single lookup you are about to see.

**04 Open the Input Dropdown**
> On your dashboard, open the I have dropdown.

**05 Choose LinkedIn Profile URL**
> Select LinkedIn Profile URL, because that is the column your list already has.

**06 Open the Output Dropdown**
> Open I want to find.

**07 Choose Email Address**
> Select Email Address. This pairing costs ten credits per lead, and you are charged only when a lead comes back with one.

**08 Paste One Profile URL**
> Enter a single LinkedIn profile URL first. Prove the pairing works on one lead before you spend credits on two hundred and fifty.

**09 Click Enrich Data**
> LinkFinder AI returns the verified email tied to that profile.

**10 Confirm the Result**
> There is the email. That is the same operation the bulk run performs on every row of your file.

**11 Switch to Bulk**
> Click Bulk. Your input and output selections carry across, so the run does exactly what you tested.

**12 Open the CSV Uploader**
> Click Upload CSV (bulk).

**13 Choose Your File**
> Click Select File.

**14 Select Your List**
> Pick your CSV. One column of LinkedIn profile URLs is all the file needs — no headers to match, no template to fill in.

**15 Check the Column Preview**
> Confirm the column it picked up is the one holding your URLs. This is the last point before credits are spent.

**16 Start the Run**
> Click Process 250 items. Every row is enriched with the pairing you tested on one lead.

**17 Let It Run**
> Rows fill in as they resolve. You can leave the tab — the run does not depend on this window staying open.

**18 Review What Came Back**
> Rows that resolved carry an email. Rows that did not are left empty and cost you nothing, so your credit spend tracks results rather than attempts.

**19 Export the Results**
> Click Export CSV.

**20 Open the File**
> Your original columns come back untouched, with the enriched data added alongside — ready to import straight into your CRM or your sequencer.

**21 Check What It Cost**
> Your balance dropped by the number of leads that actually returned an email, not by the two hundred and fifty you submitted.

**22 Top Up When You Need To**
> Click Buy Credits.

**23 Pick a Pack**
> Packs start at twenty-five dollars. Above a few thousand leads a month, a plan works out cheaper per credit than packs do.

## Closing card

**24 Enrich Your Own List**
> Export a list of LinkedIn URLs from your CRM and run it through the same flow — the free credits on signup are enough to prove it on your own data before you pay anything.

## YouTube

**Title:** Bulk Enrich a CSV of LinkedIn Leads (250 at Once)

**Description:**

```
Full guide → https://linkfinderai.com/bulk-linkedin-enrichment

Enrich an entire CSV of leads in one run. Drop in a list of LinkedIn profile
URLs and get verified emails back on every row that resolves — original
columns untouched, ready to import into your CRM.

Test the pairing on one lead first, then run the file. You are charged only
for rows that come back with data, so empty rows cost nothing.

00:00 What 250 enriched leads look like
00:20 Testing the pairing on one lead
00:55 Switching to bulk and uploading your CSV
01:40 The run, and what comes back
02:20 Exporting, and what it actually cost

Free credits on signup — enough to run this on your own list.

#leadgeneration #b2bsales #linkedin #dataenrichment #salesops
```

## Embed snippet

Paste into `bulk-linkedin-enrichment.html`, matching how the existing video
pages do it (see `company-employee-finder.html`):

```html
    <div class="video-embed-wrap">
      <div class="video-responsive">
        <iframe src="https://www.youtube.com/embed/VIDEO_ID" title="LinkFinder AI demo video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe>
      </div>
    </div>
```

Then flip this row to `"status": "live"` in `catalog.json`.
