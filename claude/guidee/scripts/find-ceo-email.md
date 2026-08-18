# Find a CEO's Email Address With LinkFinder AI

| | |
| --- | --- |
| **Slug** | `find-ceo-email` |
| **Target page** | `resources/find-ceo-email.html` |
| **Derived from** | that page's own steps — keep the two in sync |
| **Length** | 11 steps, ~2 min |

## Cover

> In this video we are going to see how to find a CEO's email address using LinkFinder AI.

## Click script

Rehearse this before recording. Type each value in one go — a pause mid-field becomes two steps in the Guidde output.

| # | Action | Target | Notes |
| --- | --- | --- | --- |
| 01 | (hold on the finished result) | exported CSV / found value | the payoff, before the how |
| 02 | Click | first link in the video description | — |
| 03 | Click | `Start Free Trial` | — |
| 04 | Click / Fill | `—` | Choose your input and output types |
| 05 | Click / Fill | `—` | Filter by seniority level |
| 06 | Click / Fill | `—` | Set how many results you want |
| 07 | Click / Fill | `Enrich Data to pull the matchin` | Enter the company domain and enrich |
| 08 | Click / Fill | `—` | Review the results |
| 09 | Click / Fill | `input to LinkedIn Profile URL` | Switch input to LinkedIn Profile URL |
| 10 | Click / Fill | `Enrich Data to retrieve their c` | Paste the LinkedIn URL and enrich |
| 11 | Click / Fill | `—` | View the enriched contact data |
| 12 | (closing card) | — | — |

## Step cards

Narration lifted from the page, then tightened for speech. Anything still reading like prose needs a second pass — see STYLE.md.

**01 What You End Up With**
> TODO: one sentence naming the result the viewer is about to get.

**02 Open LinkFinder AI**
> Click the first link in the video description to open LinkFinder AI.

**03 Create Your Free Account**
> Click Start Free Trial. You get free credits on signup, which covers everything in this video.

<!-- section: Find executives by seniority level at a company -->

**04 Choose your Input and Output Types**
> Set the input to Company Domain and the output to Company Employees List to pull a filtered roster instead of a single lookup.

**05 Filter by Seniority Level**
> Select the seniority levels you want — Founder, Owner, C-Suite, Director, or Partner — to narrow the list to decision-makers.

**06 Set How Many Results You Want**
> Enter the number of employees to return, for example 25, to control the size of the result and the credits spent.

**07 Enter the Company Domain and Enrich**
> Type the domain — for example tesla.com — and click Enrich Data to pull the matching executives.

**08 Review the Results**
> Each result includes the executive's name, title, and LinkedIn URL — click through to confirm the right person before enriching further.

<!-- section: Enrich a known executive's LinkedIn profile -->

**09 Switch Input to LinkedIn Profile URL**
> Set the input type to LinkedIn Profile URL and choose an output such as Email Address or Phone Number.

**10 Paste the LinkedIn URL and Enrich**
> Enter the executive's LinkedIn profile URL and click Enrich Data to retrieve their contact details.

**11 View the Enriched Contact Data**
> LinkFinder AI returns the verified email and any other requested fields tied to that profile.

**12 Closing card**
> TODO: name the next action — start a free trial, or the next video in the series.

## Deliberately not in this video

- **Find executive contacts programmatically via API** (3 steps) — its own video and its own landing page. Folding it in is what pushed the reference guidee to 67 steps.

## Embed snippet

Paste into `resources/find-ceo-email.html`, matching the pattern in `linkedin-profile-scraper.html`.

```html
<h2 style="font-size:1.75rem;font-weight:700;margin-bottom:1.25rem;">See it in action</h2>
<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
  <iframe
    src="https://www.youtube.com/embed/REPLACE_WITH_ID?rel=0&modestbranding=1"
    title="Find a CEO's Email Address With LinkFinder AI"
    style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"
    loading="lazy"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen></iframe>
</div>
```
