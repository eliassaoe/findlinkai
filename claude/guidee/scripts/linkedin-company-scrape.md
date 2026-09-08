# Scrape Any LinkedIn Company Page With LinkFinder AI

| | |
| --- | --- |
| **Slug** | `linkedin-company-scrape` |
| **Target page** | `linkedin-company-scraper.html` |
| **Enrichment** | LinkedIn Company URL -> LinkedIn Company Data |
| **Demo data** | `linkedin.com/company/tesla` |
| **Length** | 15 steps, ~1 min 45 s — single-lookup only, no bulk section, deliberately short |
| **Title score** | not yet scored — `vidiq_score_title` was out of credits when this pass was written. Score before recording. |
| **Written** | by hand from `template.md` — no resources page for this flow to derive from |

## Cover

> In this video we are going to see how to scrape a LinkedIn company page using LinkFinder AI.

## Before you record

- Type the LinkedIn company URL in one go.
- Have the result panel ready to hold on screen for a couple of seconds at step 01 and again at step 10 — every field listed below should actually be populated in the demo run.

## Click script

Every `Target` label is taken verbatim from `app-ui.md`.

| # | Action | Target | Type |
| --- | --- | --- | --- |
| 01 | Hold | result panel already showing Website, Industry, Company Size, Headquarters, Founded, LinkedIn Followers | — |
| 02 | Click | first link in the video description | — |
| 03 | Click | `Start Free Trial` | — |
| 04 | Click | `I have` | — |
| 05 | Select | `LinkedIn Company URL` | — |
| 06 | Click | `I want to find` | — |
| 07 | Select | `LinkedIn Company Data` | — |
| 08 | Fill | `Enter LinkedIn Company URL` | `linkedin.com/company/tesla` |
| 09 | Click | `Enrich Data` | — |
| 10 | Hold | result panel filling in: Website, Industry, Company Size, Headquarters, Founded, LinkedIn Followers | — |
| 11 | Click | `View company page` | — |
| 12 | Click | `Copy` next to `Website` | — |
| 13 | Hold | credit balance in the header | — |
| 14 | Closing card | — | — |

## Step cards

**01 What You End Up With**
> A LinkedIn company URL goes in, and six fields come back — website, industry, size, headquarters, founding year, follower count. Here is how, in under two minutes.

**02 Open LinkFinder AI**
> Click the first link in the video description to open LinkFinder AI.

**03 Create Your Free Account**
> Click Start Free Trial. You get free credits on signup, which covers this lookup.

**04 Open the Input Dropdown**
> On your dashboard, open the I have dropdown.

**05 Choose LinkedIn Company URL**
> Select LinkedIn Company URL.

**06 Open the Output Dropdown**
> Open I want to find.

**07 Choose LinkedIn Company Data**
> Select LinkedIn Company Data. This pairing costs six credits — more than a single field like Employee Count, because it pulls the company's full profile in one call.

**08 Paste The Company URL**
> Enter a company's LinkedIn page URL, like linkedin.com/company/tesla.

**09 Click Enrich Data**
> LinkFinder AI reads the company's live LinkedIn page and structures it into fields.

**10 Review the Result**
> Website, industry, company size, headquarters, founding year, and LinkedIn follower count — all in one result, no manual copying off the page.

**11 Open The Source Page**
> Click View company page to confirm it against the real LinkedIn page.

**12 Copy a Field**
> Click Copy next to Website to grab any field on its own.

**13 Check What It Cost**
> Six credits, deducted once the result came back — not before.

## Closing card

**14 Try It On Your Own Target List**
> Swap in any company's LinkedIn URL — a prospect, a competitor, an account on your target list — the free credits on signup are enough to run a handful before you pay anything.

## YouTube

**Title:** Scrape Any LinkedIn Company Page With LinkFinder AI

**Description:**

```
Full guide → https://linkfinderai.com/linkedin-company-scraper

Turn a LinkedIn company URL into a structured record — website, industry,
company size, headquarters, founding year, and follower count — without
opening the page and copying fields by hand.

00:00 What one company URL returns
00:12 Creating a free account
00:25 Running the lookup
01:00 Reading every field in the result
01:30 What it cost

Free credits on signup — enough to run this on your own target list.

#leadgeneration #b2bsales #linkedin #dataenrichment #salesops
```

## Embed snippet

Paste into `linkedin-company-scraper.html`, matching how the existing
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

Not yet generated — `vidiq_voiceover_generate` was out of credits on the
connected account when this pass was written. Narration text above is
final and ready to synthesize (voice `iP95p4xoKVk53GoZ742B`, Chris, the
fixed voice per `METHOD.md`) once the account tops up. Save the result to
`claude/guidee/audio/linkedin-company-scrape-vo.mp3`.
