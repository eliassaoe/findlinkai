# LinkedIn Company Scraping: How to Pull Data for Many Companies at Once With LinkFinder AI

| | |
| --- | --- |
| **Slug** | `linkedin-company-scraping` |
| **Target page** | `resources/linkedin-company-scraping.html` |
| **Derived from** | that page's own steps — keep the two in sync |
| **Length** | 9 steps, ~2 min |

## Cover

> In this video we are going to see how to pull data for many companies at once using LinkFinder AI.

## Click script

Rehearse this before recording. Type each value in one go — a pause mid-field becomes two steps in the Guidde output.

| # | Action | Target | Notes |
| --- | --- | --- | --- |
| 01 | (hold on the finished result) | exported CSV / found value | the payoff, before the how |
| 02 | Click | first link in the video description | — |
| 03 | Click | `Start Free Trial` | — |
| 04 | Click / Fill | `—` | Create a free account |
| 05 | Click / Fill | `input and output data types` | Select the input and output data types |
| 06 | Click / Fill | `Enrich Data` | Paste the company's LinkedIn URL and enrich |
| 07 | Click / Fill | `CSV upload option` | Switch to the CSV upload option |
| 08 | Click / Fill | `list` | Process the list |
| 09 | Click / Fill | `Export` | Export the enriched data |
| 10 | (closing card) | — | — |

## Step cards

Narration lifted from the page, then tightened for speech. Anything still reading like prose needs a second pass — see STYLE.md.

**01 What You End Up With**
> TODO: one sentence naming the result the viewer is about to get.

**02 Open LinkFinder AI**
> Click the first link in the video description to open LinkFinder AI.

**03 Create Your Free Account**
> Click Start Free Trial. You get free credits on signup, which covers everything in this video.

<!-- section: Extract data from a single LinkedIn company URL -->

**04 Create a Free Account**
> Go to linkfinderai.com and sign up — new accounts start with free credits to use on company lookups.

**05 Select the Input and Output Data Types**
> Choose LinkedIn Company URL as the input type, and LinkedIn Company Info as the output type.

**06 Paste the Company's LinkedIn URL and Enrich**
> Paste the LinkedIn company URL into the input field and click "Enrich Data" — the result includes the company's name, followers, and About section.

<!-- section: Bulk extract data for a CSV list of LinkedIn company URLs -->

**07 Switch to the CSV Upload Option**
> On the same screen, choose the option to upload a CSV instead of the single-URL form.

**08 Process the List**
> Each row in the CSV — a LinkedIn company URL — can be processed individually or as a batch.

**09 Export the Enriched Data**
> Once processing finishes, click "Export" to download the full list with each company matched to its enriched LinkedIn data. De-duplicate your list before uploading. Running the same company URL twice costs two lookups instead of one.

**10 Closing card**
> TODO: name the next action — start a free trial, or the next video in the series.

## Deliberately not in this video

- **Scrape LinkedIn company data programmatically via API** (2 steps) — its own video and its own landing page. Folding it in is what pushed the reference guidee to 67 steps.

## Embed snippet

Paste into `resources/linkedin-company-scraping.html`, matching the pattern in `linkedin-profile-scraper.html`.

```html
<h2 style="font-size:1.75rem;font-weight:700;margin-bottom:1.25rem;">See it in action</h2>
<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
  <iframe
    src="https://www.youtube.com/embed/REPLACE_WITH_ID?rel=0&modestbranding=1"
    title="LinkedIn Company Scraping: How to Pull Data for Many Companies at Once With LinkFinder AI"
    style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"
    loading="lazy"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen></iframe>
</div>
```
