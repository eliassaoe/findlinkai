# Free Email Finder: How to Find Anyone's Email Address With LinkFinder AI

| | |
| --- | --- |
| **Slug** | `email-finder` |
| **Target page** | `resources/email-finder.html` |
| **Derived from** | that page's own steps — keep the two in sync |
| **Length** | 10 steps, ~2 min |

## Cover

> In this video we are going to see how to find anyone's email address using LinkFinder AI.

## Click script

Rehearse this before recording. Type each value in one go — a pause mid-field becomes two steps in the Guidde output.

| # | Action | Target | Notes |
| --- | --- | --- | --- |
| 01 | (hold on the finished result) | exported CSV / found value | the payoff, before the how |
| 02 | Click | first link in the video description | — |
| 03 | Click | `Start Free Trial` | — |
| 04 | Click / Fill | `—` | Open LinkFinder AI and pick Email Finder |
| 05 | Click / Fill | `bill` | Enter the first and last name |
| 06 | Click / Fill | `company domain` | Enter the company domain |
| 07 | Click / Fill | `—` | Click Enrich Data |
| 08 | Click / Fill | `sarah johnson` | Search by full name and company |
| 09 | Click / Fill | `—` | Feed the LinkedIn URL back into the email search |
| 10 | Click / Fill | `—` | Click Enrich Data to get the verified email |
| 11 | (closing card) | — | — |

## Step cards

Narration lifted from the page, then tightened for speech. Anything still reading like prose needs a second pass — see STYLE.md.

**01 What You End Up With**
> TODO: one sentence naming the result the viewer is about to get.

**02 Open LinkFinder AI**
> Click the first link in the video description to open LinkFinder AI.

**03 Create Your Free Account**
> Click Start Free Trial. You get free credits on signup, which covers everything in this video.

<!-- section: Find an email from a name and company domain -->

**04 Open LinkFinder AI and Pick Email Finder**
> From your LinkFinder AI dashboard, select the email finder option to open the search form.

**05 Enter the First and Last Name**
> Fill in the lead's first name (e.g. "bill") and last name (e.g. "gates") in their respective fields.

**06 Enter the Company Domain**
> Add the company's domain — for example, microsoft.com — so the search knows which organization to check.

**07 Click Enrich Data**
> LinkFinder AI checks the name against that domain's email pattern and verifies the result before returning it.

<!-- section: Find an email by chaining a LinkedIn URL lookup -->

**08 Search by Full Name and Company**
> Enter the lead's full name (e.g. "sarah johnson") and company name (e.g. "salesforce") to find their LinkedIn profile URL first.

**09 Feed the LinkedIn URL Back into the Email Search**
> Switch the input type to LinkedIn Profile URL and the output type to Email Address, then paste in the URL you just found.

**10 Click Enrich Data to Get the Verified Email**
> LinkFinder AI returns the verified email tied to that LinkedIn profile — in this example, sarah.johnson@salesforce.com.

**11 Closing card**
> TODO: name the next action — start a free trial, or the next video in the series.

## Deliberately not in this video

- **Find emails programmatically via API** (3 steps) — its own video and its own landing page. Folding it in is what pushed the reference guidee to 67 steps.

## Embed snippet

Paste into `resources/email-finder.html`, matching the pattern in `linkedin-profile-scraper.html`.

```html
<h2 style="font-size:1.75rem;font-weight:700;margin-bottom:1.25rem;">See it in action</h2>
<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
  <iframe
    src="https://www.youtube.com/embed/REPLACE_WITH_ID?rel=0&modestbranding=1"
    title="Free Email Finder: How to Find Anyone's Email Address With LinkFinder AI"
    style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"
    loading="lazy"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen></iframe>
</div>
```
