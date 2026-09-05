# Find A Verified Email From A Name And Company With LinkFinder AI

| | |
| --- | --- |
| **Slug** | `name-to-verified-email` |
| **Target page** | `name-to-email-api.html` |
| **Enrichment** | Lead Full Name -> Verified Email |
| **Demo data** | `Marc` / `Benioff` / `salesforce.com` single · `leads-50.csv`, columns `first_name`, `last_name`, `domain`, 50 rows of well-known executives |
| **Length** | 24 steps, ~2 min 45 s |
| **Title score** | 88/100 (`vidiq_score_title`, type long, channel UCAq5URh_O2gbg4bFFwBWfdg) |
| **Written** | by hand from `template.md` — no resources page for this flow to derive from |

## ⚠ app-ui.md correction for this pairing

`app-ui.md`'s combined "Enter Lead Full Name + Company Name" field
(`e.g., John Doe JP morgan`) is what the UI shows for **Lead Full Name ->
LinkedIn Profile URL**. It is NOT what the UI shows for **Lead Full Name ->
Verified Email** — selecting Verified Email as the output swaps the form to
three separate fields (verified directly in `app.html`, `emailLeadFields` /
`isEmailLookup`, ~line 1036 and ~3087):

| Field | Label | Placeholder |
| --- | --- | --- |
| First Name | `First Name` | `e.g., Sarah` |
| Last Name | `Last Name` | `e.g., Johnson` |
| Company Domain | `Company Domain` | `e.g., tesla.com` — a domain, not a company name |

Both names must be single words (the form rejects a space in either). Bulk
mode for this pairing uploads a CSV with columns `first_name`, `last_name`,
`domain` (all required) — not the `name`/`company` columns the LinkedIn-URL
pairing uses. Use the labels in this table for the click script below, not
`app-ui.md`'s row 1. `app-ui.md` should get a follow-up correction so the
next storyboard author does not repeat this mistake.

## Cover

> In this video we are going to see how to find a verified email address from just a name and a company using LinkFinder AI.

## Before you record

- Put `leads-50.csv` on the Desktop, at the top of the file dialog, before you start.
- Have the finished export already open in a spreadsheet in another window for step 01 — do not build it on camera.
- Type `Marc`, `Benioff`, and `salesforce.com` each in one go — a pause mid-field becomes an extra step in the Guidde output (see STYLE.md fix #3).

## Click script

Rehearse this end to end first. Every `Target` label below is taken verbatim from `app.html` (see the correction above) — do not use `app-ui.md`'s row 1 for this pairing.

| # | Action | Target | Type |
| --- | --- | --- | --- |
| 01 | Hold | finished export open in a spreadsheet, Email column filled for every row | — |
| 02 | Click | first link in the video description | — |
| 03 | Click | `Start Free Trial` | — |
| 04 | Click | `I have` | — |
| 05 | Select | `Lead Full Name` | — |
| 06 | Click | `I want to find` | — |
| 07 | Select | `Verified Email` | — |
| 08 | Fill | `First Name` | `Marc` |
| 09 | Fill | `Last Name` | `Benioff` |
| 10 | Fill | `Company Domain` | `salesforce.com` |
| 11 | Click | `Enrich Data` | — |
| 12 | Hold | result panel showing the returned verified email | — |
| 13 | Click | `Copy` next to the email | — |
| 14 | Click | `Bulk` | — |
| 15 | Click | `Upload CSV (bulk)` | — |
| 16 | Click | `Select File` | — |
| 17 | Click | `leads-50.csv` on the Desktop, then confirm | — |
| 18 | Hold | column preview showing `first_name`, `last_name`, `domain` mapped | — |
| 19 | Click | `Process 50 items` | — |
| 20 | Hold | completed run, filled rows visible | — |
| 21 | Click | `Export CSV` | — |
| 22 | Hold | downloaded file opening in the spreadsheet | — |
| 23 | Hold | credit balance in the header | — |
| 24 | Closing card | — | — |

## Step cards

**01 What You End Up With**
> Fifty names and companies went in, and this came back — every row with a verified email next to it, not a guessed name@domain.com pattern. Here is how, in under three minutes.

**02 Open LinkFinder AI**
> Click the first link in the video description to open LinkFinder AI.

**03 Create Your Free Account**
> Click Start Free Trial. You get free credits on signup, which covers the single lookup you are about to see.

**04 Open the Input Dropdown**
> On your dashboard, open the I have dropdown.

**05 Choose Lead Full Name**
> Select Lead Full Name.

**06 Open the Output Dropdown**
> Open I want to find.

**07 Choose Verified Email**
> Select Verified Email. This pairing costs seven credits per lead — every email is checked for deliverability before it comes back to you.

**08 Enter The First Name**
> Type the person's first name, like Marc.

**09 Enter The Last Name**
> Type the last name, like Benioff.

**10 Enter The Company Domain**
> Type the company's domain, not its name — salesforce.com, not Salesforce. This is what the match runs against.

**11 Click Enrich Data**
> LinkFinder AI checks real inbox patterns against that domain and verifies the result before returning it.

**12 Confirm the Result**
> There is the verified email. That is the same lookup the bulk run performs on every row of your file.

**13 Copy It**
> Click Copy to grab the email straight from the result panel.

**14 Switch to Bulk**
> Click Bulk. Your input and output selections carry across, so the run does exactly what you tested.

**15 Open the CSV Uploader**
> Click Upload CSV (bulk).

**16 Choose Your File**
> Click Select File.

**17 Select Your List**
> Pick your CSV. First name, last name, and domain in three columns is all the file needs.

**18 Check the Column Preview**
> Confirm the three columns it picked up are the right ones. This is the last point before credits are spent.

**19 Start the Run**
> Click Process 50 items. Every row is enriched with the pairing you tested on Marc Benioff.

**20 Review What Came Back**
> Rows that resolved carry a verified email. Rows that did not are left empty and cost you nothing, so your credit spend tracks results, not attempts.

**21 Export the Results**
> Click Export CSV.

**22 Open the File**
> Your original columns come back untouched, with the verified email added alongside — ready to import straight into your CRM or your sequencer.

**23 Check What It Cost**
> Your balance dropped by seven credits for every lead that actually returned an email, not by the fifty you submitted.

## Closing card

**24 Enrich Your Own List**
> Export a list of names, last names, and company domains from your CRM and run it through the same flow — the free credits on signup are enough to prove it on your own data before you pay anything.

## YouTube

**Title:** Find A Verified Email From A Name And Company With LinkFinder AI

**Description:**

```
Full guide → https://linkfinderai.com/name-to-email-api

Turn a first name, last name, and company domain into a verified email
address — checked for deliverability before it's returned, not a guessed
name@domain.com pattern. Test the pairing on one lead, then run a whole
CSV of names through the same flow and export every row with a verified
email next to it.

You are charged only for leads that actually return a verified email, so
empty rows cost nothing.

00:00 What 50 verified leads look like
00:14 Creating a free account
00:28 Testing the pairing on one lead (Marc Benioff, Salesforce)
01:10 Switching to bulk and uploading your CSV
01:50 The run, and what comes back
02:25 Exporting, and what it actually cost

Free credits on signup — enough to run this on your own list.

#leadgeneration #b2bsales #emailfinder #dataenrichment #salesops
```

## Embed snippet

Paste into `name-to-email-api.html`, matching how the existing video pages
do it (see `company-employee-finder.html`):

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
the result to `claude/guidee/audio/name-to-verified-email-vo.mp3`.
