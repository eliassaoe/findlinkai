# Scrape LinkedIn Profiles at Scale With LinkFinder AI

| | |
| --- | --- |
| **Slug** | `scrape-linkedin-profile` |
| **Target page** | `resources/scrape-linkedin-profile.html` |
| **Derived from** | that page's own steps — keep the two in sync |
| **Length** | 11 steps, ~2 min |

## Cover

> In this video we are going to see how to scrape LinkedIn profiles at scale using LinkFinder AI.

## Click script

Rehearse this before recording. Type each value in one go — a pause mid-field becomes two steps in the Guidde output.

| # | Action | Target | Notes |
| --- | --- | --- | --- |
| 01 | (hold on the finished result) | exported CSV / found value | the payoff, before the how |
| 02 | Click | first link in the video description | — |
| 03 | Click | `Start Free Trial` | — |
| 04 | Click / Fill | `—` | Set input to Lead Full Name, output to LinkedIn Profile URL |
| 05 | Click / Fill | `Enrich Data to confirm the flow` | Test it on one lead |
| 06 | Click / Fill | `—` | Switch to Upload CSV (bulk) for the full list |
| 07 | Click / Fill | `and export the LinkedIn URLs` | Process and export the LinkedIn URLs |
| 08 | Click / Fill | `—` | Set input to LinkedIn Profile URL |
| 09 | Click / Fill | `—` | Set output to LinkedIn Profile Data |
| 10 | Click / Fill | `list` | Process the list |
| 11 | Click / Fill | `final enriched data` | Export the final enriched data |
| 12 | (closing card) | — | — |

## Step cards

Narration lifted from the page, then tightened for speech. Anything still reading like prose needs a second pass — see STYLE.md.

**01 What You End Up With**
> TODO: one sentence naming the result the viewer is about to get.

**02 Open LinkFinder AI**
> Click the first link in the video description to open LinkFinder AI.

**03 Create Your Free Account**
> Click Start Free Trial. You get free credits on signup, which covers everything in this video.

<!-- section: Find LinkedIn URLs for a list of leads -->

**04 Set Input to Lead Full Name, Output to LinkedIn Profile URL**
> On a single lookup, select Lead Full Name as the input type and LinkedIn Profile URL as the output.

**05 Test It on One Lead**
> Enter a full name and company — for example, Bill Gates at Microsoft — and click Enrich Data to confirm the flow works.

**06 Switch to Upload CSV (bulk) for the Full List**
> For a full list, upload a CSV of up to 100 names and companies instead of searching one at a time.

**07 Process and Export the LinkedIn URLs**
> Run the enrichment on the whole list, then export the results — a LinkedIn URL matched to each lead, with any that weren't found marked separately.

<!-- section: Scrape full profile data from those LinkedIn URLs -->

**08 Set Input to LinkedIn Profile URL**
> Switch the input type to LinkedIn Profile URL, using the list of URLs from the previous step.

**09 Set Output to LinkedIn Profile Data**
> Choose LinkedIn Profile Data as the output to get the full structured profile, not just a single field.

**10 Process the List**
> Click Process items to scrape profile data for every URL in the list.

**11 Export the Final Enriched Data**
> Download the complete result — job title, location, and other profile fields for every lead — as a CSV. Running this as two chained steps — URL first, then profile data — keeps each request cheap and lets you review the LinkedIn URLs before spending credits scraping full profiles.

**12 Closing card**
> TODO: name the next action — start a free trial, or the next video in the series.

## Embed snippet

Paste into `resources/scrape-linkedin-profile.html`, matching the pattern in `linkedin-profile-scraper.html`.

```html
<h2 style="font-size:1.75rem;font-weight:700;margin-bottom:1.25rem;">See it in action</h2>
<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
  <iframe
    src="https://www.youtube.com/embed/REPLACE_WITH_ID?rel=0&modestbranding=1"
    title="Scrape LinkedIn Profiles at Scale With LinkFinder AI"
    style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"
    loading="lazy"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen></iframe>
</div>
```
