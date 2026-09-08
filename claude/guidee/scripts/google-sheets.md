# Enrich LinkedIn Data Straight Into Google Sheets With LinkFinder AI

| | |
| --- | --- |
| **Slug** | `google-sheets` |
| **Target page** | `linkedIn-enrichment-google-sheets.html` |
| **Enrichment** | `platform: sheets` — the Apps Script `=LINKFINDER()` custom function route on this page, NOT the Marketplace add-on and NOT the unpublished second add-on. Per `CLAUDE.md`'s "Three different things are called 'the Google Sheets integration'" note, this page is specifically the copy-paste-script route. |
| **Demo data** | Column `A`: `Tesla`, `Apple`, `Microsoft`, `Salesforce`, `Netflix` · `=LINKFINDER(A2, "company_name_to_website")` dragged down column `B` |
| **Length** | 16 steps, ~2 min |
| **Title score** | not yet scored — `vidiq_score_title` was out of credits when this pass was written. Score before recording. |
| **Written** | by hand from `template.md`. Every step, menu path, and formula below is copied verbatim from `linkedIn-enrichment-google-sheets.html`'s own "Apps Script route, in 4 steps" section — not invented. |

## Cover

> In this video we are going to see how to enrich LinkedIn data straight into Google Sheets using LinkFinder AI.

## Before you record

- Have a Google Sheet open with column A already filled with five company names (Tesla, Apple, Microsoft, Salesforce, Netflix) — do not type these on camera, it adds nothing.
- Have the LINKFINDER function code ready to paste (from the page's code block) rather than typing it live — Apps Script code is dense and typing it on camera adds no value.
- Have your LinkFinder AI API key ready to paste into Script Properties.

## Click script

| # | Action | Target | Type |
| --- | --- | --- | --- |
| 01 | Hold | sheet with column B fully populated with websites next to each company name | — |
| 02 | Click | first link in the video description | — |
| 03 | Click | `Start Free Trial` | — |
| 04 | Click | `API & MCP` tab | — |
| 05 | Click | `Copy` next to the API key | — |
| 06 | Switch | to the Google Sheet | — |
| 07 | Click | `Extensions` -> `Apps Script` | — |
| 08 | Select all, delete | the placeholder `function myFunction() {}` code | — |
| 09 | Paste | the `lfCall` + `LINKFINDER` function from the docs page | — |
| 10 | Click | `Project Settings` (gear icon) | — |
| 11 | Click | `Script Properties` -> `Add script property` | name `LF_KEY`, value the pasted API key |
| 12 | Click | `Save script properties` | — |
| 13 | Return to the script editor, click | `Save` (disk icon) | — |
| 14 | Switch | back to the sheet | — |
| 15 | Fill | cell `B2` | `=LINKFINDER(A2, "company_name_to_website")` |
| 16 | Press | Enter, then drag the fill handle down through `B6` | — |

## Step cards

**01 What You End Up With**
> Five company names in a column, and this came back — a working website next to every one of them, as a plain spreadsheet formula. Here is how, in about two minutes.

**02 Open LinkFinder AI**
> Click the first link in the video description to open LinkFinder AI.

**03 Create Your Free Account**
> Click Start Free Trial. You get free credits on signup, which covers everything in this video.

**04 Open the API Tab**
> Click the API & MCP tab.

**05 Copy Your Key**
> Click Copy next to your API key. You will paste this into the sheet, not into a cell — keep it out of anything you might share.

**06 Switch to Your Sheet**
> Open the Google Sheet with your list of companies.

**07 Open Apps Script**
> Click Extensions, then Apps Script. It is built into every Google Sheet — nothing to install.

**08 Clear the Placeholder**
> Delete the empty placeholder function Google starts you with.

**09 Paste the Function**
> Paste the LINKFINDER function — one block of code that turns into a formula you can use in any cell.

**10 Open Project Settings**
> Click the gear icon for Project Settings.

**11 Add Your API Key**
> Click Script Properties, add a property named LF_KEY, and paste your API key as the value — not hard-coded into the script itself, so it is never sitting in code you might share.

**12 Save the Property**
> Click Save script properties.

**13 Save the Script**
> Back in the script editor, click Save.

**14 Return to the Sheet**
> Switch back to your spreadsheet.

**15 Write the Formula**
> In the cell next to your first company, type equals LINKFINDER, the cell reference, and the pairing — company_name_to_website. This one costs one credit per row.

**16 Fill the Column**
> Press Enter, then drag the fill handle down. Every row runs the same lookup — no copy-pasting between tabs, no dashboard.

## Closing card

**17 Run It On Your Own List**
> Paste your own list of company names in column A, and drag the same formula down — the free credits on signup are enough to prove it before you pay anything. For a list too big for one formula pass, the same page has a batch script that processes hundreds of rows and picks up where it left off.

## YouTube

**Title:** Enrich LinkedIn Data Straight Into Google Sheets With LinkFinder AI

**Description:**

```
Full guide → https://linkfinderai.com/linkedIn-enrichment-google-sheets

No add-on to install for this route — paste one function into
Extensions → Apps Script and call =LINKFINDER() as a normal formula.
This video sets it up end to end: API key, the function, and one
column of companies turned into websites with a formula you can drag
down.

00:00 What a filled column looks like
00:12 Creating a free account and finding your API key
00:25 Pasting the function into Apps Script
01:05 Adding your API key to Script Properties
01:30 Writing and dragging the formula

Free credits on signup — enough to run this on your own list.

#googlesheets #dataenrichment #leadgeneration #appsscript #b2bsales
```

## Embed snippet

Paste into `linkedIn-enrichment-google-sheets.html`, matching how the
existing video pages do it (see `company-employee-finder.html`):

```html
    <div class="video-embed-wrap">
      <div class="video-responsive">
        <iframe src="https://www.youtube.com/embed/VIDEO_ID" title="LinkFinder AI demo video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe>
      </div>
    </div>
```

Then flip this row to `"status": "live"` in `catalog.json`.

## Voiceover

Not yet generated — `vidiq_voiceover_generate` was out of credits on the
connected account when this pass was written. Narration text above is
final and ready to synthesize (voice `iP95p4xoKVk53GoZ742B`, Chris, the
fixed voice per `METHOD.md`) once the account tops up. Save the result to
`claude/guidee/audio/google-sheets-vo.mp3`.
