# Find All Employees at a Company With LinkFinder AI

| | |
| --- | --- |
| **Slug** | `find-company-employees` |
| **Target page** | `resources/find-company-employees.html` |
| **Derived from** | that page's own steps — keep the two in sync |
| **Length** | 13 steps, ~2 min |

## Cover

> In this video we are going to see how to find all employees at a company using LinkFinder AI.

## Click script

Rehearse this before recording. Type each value in one go — a pause mid-field becomes two steps in the Guidde output.

| # | Action | Target | Notes |
| --- | --- | --- | --- |
| 01 | (hold on the finished result) | exported CSV / found value | the payoff, before the how |
| 02 | Click | first link in the video description | — |
| 03 | Click | `Start Free Trial` | — |
| 04 | Click / Fill | `Company Employees search` | Open the Company Employees search |
| 05 | Click / Fill | `—` | Filter by department |
| 06 | Click / Fill | `—` | Filter by seniority level |
| 07 | Click / Fill | `—` | Set the number of results |
| 08 | Click / Fill | `Enrich Data` | Enter the company domain and enrich |
| 09 | Click / Fill | `—` | Review the employee results |
| 10 | Click / Fill | `—` | Change the department or seniority filter |
| 11 | Click / Fill | `—` | Update the result limit |
| 12 | Click / Fill | `new company domain` | Enter the new company domain |
| 13 | Click / Fill | `—` | Check the results and credit cost |
| 14 | (closing card) | — | — |

## Step cards

Narration lifted from the page, then tightened for speech. Anything still reading like prose needs a second pass — see STYLE.md.

**01 What You End Up With**
> TODO: one sentence naming the result the viewer is about to get.

**02 Open LinkFinder AI**
> Click the first link in the video description to open LinkFinder AI.

**03 Create Your Free Account**
> Click Start Free Trial. You get free credits on signup, which covers everything in this video.

<!-- section: Find a company's employees by department and seniority -->

**04 Open the Company Employees Search**
> From your dashboard, select the popular search for company employees to open the filtered search form.

**05 Filter by Department**
> Choose the department you want to target, such as Marketing, Sales, or Engineering.

**06 Filter by Seniority Level**
> Narrow further by seniority — Founder, Owner, C-Suite, Director, or Partner — to focus on decision-makers.

**07 Set the Number of Results**
> Enter how many employees you want returned, for example 20, to control scope and credit spend.

**08 Enter the Company Domain and Enrich**
> Type the target company's domain — for example, tesla.com — and click Enrich Data.

**09 Review the Employee Results**
> Each result includes the employee's name, title, and LinkedIn URL for further enrichment. Each employee found costs 0.5 credits, so start with a smaller result count while you're testing filters on a new account.

<!-- section: Re-run the search for a different company or filter -->

**10 Change the Department or Seniority Filter**
> Adjust the department and seniority dropdowns to explore a different slice of the same company, or prep for a new one.

**11 Update the Result Limit**
> Set a new employee count limit to match how deep you want to go for this account.

**12 Enter the New Company Domain**
> Swap in the next target's domain — for example, microsoft.com — and enrich again.

**13 Check the Results and Credit Cost**
> Larger companies return more matches; keep an eye on your credit balance as you work through a target list.

**14 Closing card**
> TODO: name the next action — start a free trial, or the next video in the series.

## Deliberately not in this video

- **Pull employee lists programmatically via API** (2 steps) — its own video and its own landing page. Folding it in is what pushed the reference guidee to 67 steps.

## Embed snippet

Paste into `resources/find-company-employees.html`, matching the pattern in `linkedin-profile-scraper.html`.

```html
<h2 style="font-size:1.75rem;font-weight:700;margin-bottom:1.25rem;">See it in action</h2>
<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
  <iframe
    src="https://www.youtube.com/embed/REPLACE_WITH_ID?rel=0&modestbranding=1"
    title="Find All Employees at a Company With LinkFinder AI"
    style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"
    loading="lazy"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen></iframe>
</div>
```
