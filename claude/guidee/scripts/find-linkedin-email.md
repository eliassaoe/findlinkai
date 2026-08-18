# Find a Lead's Email From Their LinkedIn URL With LinkFinder AI

| | |
| --- | --- |
| **Slug** | `find-linkedin-email` |
| **Target page** | `resources/find-linkedin-email.html` |
| **Derived from** | that page's own steps — keep the two in sync |
| **Length** | 11 steps, ~2 min |

## Cover

> In this video we are going to see how to find a lead's email from their LinkedIn URL using LinkFinder AI.

## Click script

Rehearse this before recording. Type each value in one go — a pause mid-field becomes two steps in the Guidde output.

| # | Action | Target | Notes |
| --- | --- | --- | --- |
| 01 | (hold on the finished result) | exported CSV / found value | the payoff, before the how |
| 02 | Click | first link in the video description | — |
| 03 | Click | `Start Free Trial` | — |
| 04 | Click / Fill | `—` | Set the input to LinkedIn Profile URL |
| 05 | Click / Fill | `—` | Set the output to Email Address |
| 06 | Click / Fill | `—` | Paste in the lead's LinkedIn URL |
| 07 | Click / Fill | `—` | Click Enrich Data |
| 08 | Click / Fill | `Upload CSV (bulk)` | Switch to Upload CSV (bulk) |
| 09 | Click / Fill | `your CSV of LinkedIn URLs` | Select your CSV of LinkedIn URLs |
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

<!-- section: Find one lead's email from their LinkedIn URL -->

**04 Set the Input to LinkedIn Profile URL**
> On your dashboard, choose LinkedIn Profile URL as the input data type.

**05 Set the Output to Email Address**
> Select Email Address as the output type to get a verified email back instead of other profile data.

**06 Paste in the Lead's LinkedIn URL**
> Enter the lead's LinkedIn profile URL into the input field.

**07 Click Enrich Data**
> LinkFinder AI returns the verified email address tied to that profile.

<!-- section: Find emails in bulk from a list of LinkedIn URLs -->

**08 Switch to Upload CSV (bulk)**
> Choose the bulk upload option instead of the single-URL form.

**09 Select your CSV of LinkedIn URLs**
> Upload a CSV file where each row is a lead's LinkedIn profile URL.

**10 Process the List**
> Click Process items to enrich every URL in the file with its matching email address.

**11 Export the Results**
> Download the enriched list — each lead now paired with a verified email — as a CSV.

**12 Closing card**
> TODO: name the next action — start a free trial, or the next video in the series.

## Deliberately not in this video

- **Find emails programmatically via API** (2 steps) — its own video and its own landing page. Folding it in is what pushed the reference guidee to 67 steps.

## Embed snippet

Paste into `resources/find-linkedin-email.html`, matching the pattern in `linkedin-profile-scraper.html`.

```html
<h2 style="font-size:1.75rem;font-weight:700;margin-bottom:1.25rem;">See it in action</h2>
<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
  <iframe
    src="https://www.youtube.com/embed/REPLACE_WITH_ID?rel=0&modestbranding=1"
    title="Find a Lead's Email From Their LinkedIn URL With LinkFinder AI"
    style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"
    loading="lazy"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen></iframe>
</div>
```
