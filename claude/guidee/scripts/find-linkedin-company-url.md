# Find a Company's LinkedIn URL From Its Name With LinkFinder AI

| | |
| --- | --- |
| **Slug** | `find-linkedin-company-url` |
| **Target page** | `resources/find-linkedin-company-url.html` |
| **Derived from** | that page's own steps — keep the two in sync |
| **Length** | 9 steps, ~2 min |

## Cover

> In this video we are going to see how to find a company's LinkedIn URL from its name using LinkFinder AI.

## Click script

Rehearse this before recording. Type each value in one go — a pause mid-field becomes two steps in the Guidde output.

| # | Action | Target | Notes |
| --- | --- | --- | --- |
| 01 | (hold on the finished result) | exported CSV / found value | the payoff, before the how |
| 02 | Click | first link in the video description | — |
| 03 | Click | `Start Free Trial` | — |
| 04 | Click / Fill | `input and output data types` | Select the input and output data types |
| 05 | Click / Fill | `company name` | Enter the company name |
| 06 | Click / Fill | `Enrich Data` | Click "Enrich Data" to get the URL |
| 07 | Click / Fill | `bulk upload` | Switch to bulk upload |
| 08 | Click / Fill | `—` | Preview the imported companies |
| 09 | Click / Fill | `Process items` | Process the list and export the results |
| 10 | (closing card) | — | — |

## Step cards

Narration lifted from the page, then tightened for speech. Anything still reading like prose needs a second pass — see STYLE.md.

**01 What You End Up With**
> TODO: one sentence naming the result the viewer is about to get.

**02 Open LinkFinder AI**
> Click the first link in the video description to open LinkFinder AI.

**03 Create Your Free Account**
> Click Start Free Trial. You get free credits on signup, which covers everything in this video.

<!-- section: Find a single company LinkedIn URL -->

**04 Select the Input and Output Data Types**
> Go to linkfinderai.com . In the first dropdown, choose Company Name as the input type; in the second, choose Company LinkedIn URL as the output.

**05 Enter the Company Name**
> Type the company's name into the input field — for example, Stripe.

**06 Click "Enrich Data" to Get the URL**
> The tool runs the lookup and returns the matching LinkedIn company page — for Stripe, that's linkedin.com/company/stripe.

<!-- section: Bulk find LinkedIn URLs for a CSV list of companies -->

**07 Switch to Bulk Upload**
> On the same screen, choose the option to upload a CSV of company names instead of the single-name form.

**08 Preview the Imported Companies**
> Check that the company names came in correctly before processing — for example, Acme Corporation and Globex Industries.

**09 Process the List and Export the Results**
> Click "Process items" to run the lookup on every row, then click "Export" to download the enriched list — each company now paired with its LinkedIn URL. De-duplicate your list before uploading. Running the same company name twice costs two lookups instead of one, and a clean list processes faster.

**10 Closing card**
> TODO: name the next action — start a free trial, or the next video in the series.

## Deliberately not in this video

- **Find a company LinkedIn URL programmatically via API** (2 steps) — its own video and its own landing page. Folding it in is what pushed the reference guidee to 67 steps.

## Embed snippet

Paste into `resources/find-linkedin-company-url.html`, matching the pattern in `linkedin-profile-scraper.html`.

```html
<h2 style="font-size:1.75rem;font-weight:700;margin-bottom:1.25rem;">See it in action</h2>
<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
  <iframe
    src="https://www.youtube.com/embed/REPLACE_WITH_ID?rel=0&modestbranding=1"
    title="Find a Company's LinkedIn URL From Its Name With LinkFinder AI"
    style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"
    loading="lazy"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen></iframe>
</div>
```
