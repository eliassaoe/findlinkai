# Find a Company's Employee Count With LinkFinder AI

| | |
| --- | --- |
| **Slug** | `find-company-employee-count` |
| **Target page** | `resources/find-company-employee-count.html` |
| **Derived from** | that page's own steps — keep the two in sync |
| **Length** | 11 steps, ~2 min |

## Cover

> In this video we are going to see how to find a company's employee count using LinkFinder AI.

## Click script

Rehearse this before recording. Type each value in one go — a pause mid-field becomes two steps in the Guidde output.

| # | Action | Target | Notes |
| --- | --- | --- | --- |
| 01 | (hold on the finished result) | exported CSV / found value | the payoff, before the how |
| 02 | Click | first link in the video description | — |
| 03 | Click | `Start Free Trial` | — |
| 04 | Click / Fill | `—` | Set the input type to LinkedIn Company URL |
| 05 | Click / Fill | `—` | Set the output type to Employee Count |
| 06 | Click / Fill | `—` | Paste the company's LinkedIn URL |
| 07 | Click / Fill | `—` | Click Enrich Data |
| 08 | Click / Fill | `Upload CSV (bulk)` | Switch to Upload CSV (bulk) |
| 09 | Click / Fill | `—` | Upload your CSV of company LinkedIn URLs |
| 10 | Click / Fill | `list` | Process the list |
| 11 | Click / Fill | `results` | Export the results |
| 12 | (closing card) | — | — |

## Step cards

Narration lifted from the page, then tightened for speech. Anything still reading like prose needs a second pass — see STYLE.md.

**01 What You End Up With**
> TODO: one sentence naming the result the viewer is about to get.

**02 Open LinkFinder AI**
> Click the first link in the video description to open LinkFinder AI.

**03 Create Your Free Account**
> Click Start Free Trial. You get free credits on signup, which covers everything in this video.

<!-- section: Find the employee count for a single company -->

**04 Set the Input Type to LinkedIn Company URL**
> On your LinkFinder AI dashboard, select LinkedIn Company URL as the input type.

**05 Set the Output Type to Employee Count**
> Choose Employee Count as the output so the lookup returns a size range instead of other company data.

**06 Paste the Company's LinkedIn URL**
> Enter the company's LinkedIn URL — for example, Anthropic's — into the input field.

**07 Click Enrich Data**
> LinkFinder AI returns the employee count range, e.g. 11–50 employees, confirming it's an early-stage company.

<!-- section: Find employee counts in bulk from a CSV -->

**08 Switch to Upload CSV (bulk)**
> Choose the bulk upload option instead of the single-company form.

**09 Upload your CSV of Company LinkedIn URLs**
> Select a CSV file where each row is a company's LinkedIn URL.

**10 Process the List**
> Click Process items to run the employee-count lookup on every row in the file.

**11 Export the Results**
> Download the enriched list — each company now paired with its employee count range — as a CSV.

**12 Closing card**
> TODO: name the next action — start a free trial, or the next video in the series.

## Embed snippet

Paste into `resources/find-company-employee-count.html`, matching the pattern in `linkedin-profile-scraper.html`.

```html
<h2 style="font-size:1.75rem;font-weight:700;margin-bottom:1.25rem;">See it in action</h2>
<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
  <iframe
    src="https://www.youtube.com/embed/REPLACE_WITH_ID?rel=0&modestbranding=1"
    title="Find a Company's Employee Count With LinkFinder AI"
    style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"
    loading="lazy"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen></iframe>
</div>
```
