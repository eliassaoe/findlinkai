# Find a Phone Number From LinkedIn With LinkFinder AI

| | |
| --- | --- |
| **Slug** | `find-phone-number-from-linkedin` |
| **Target page** | `resources/find-phone-number-from-linkedin.html` |
| **Derived from** | that page's own steps — keep the two in sync |
| **Length** | 10 steps, ~2 min |

## Cover

> In this video we are going to see how to find a phone number from LinkedIn using LinkFinder AI.

## Click script

Rehearse this before recording. Type each value in one go — a pause mid-field becomes two steps in the Guidde output.

| # | Action | Target | Notes |
| --- | --- | --- | --- |
| 01 | (hold on the finished result) | exported CSV / found value | the payoff, before the how |
| 02 | Click | first link in the video description | — |
| 03 | Click | `Start Free Trial` | — |
| 04 | Click / Fill | `Select data type` | Select Full Name as input, LinkedIn Profile URL as output |
| 05 | Click / Fill | `lead's full name and company` | Enter the lead's full name and company |
| 06 | Click / Fill | `Enrich Data` | Click "Enrich Data" to get the LinkedIn URL |
| 07 | Click / Fill | `—` | Switch the lookup to LinkedIn URL → Phone Number |
| 08 | Click / Fill | `Enrich Data` | Paste the LinkedIn URL and enrich again |
| 09 | Click / Fill | `—` | Select LinkedIn Profile URL as input, Phone Number as output |
| 10 | Click / Fill | `Enrich Data` | Paste the URL and click "Enrich Data" |
| 11 | (closing card) | — | — |

## Step cards

Narration lifted from the page, then tightened for speech. Anything still reading like prose needs a second pass — see STYLE.md.

**01 What You End Up With**
> TODO: one sentence naming the result the viewer is about to get.

**02 Open LinkFinder AI**
> Click the first link in the video description to open LinkFinder AI.

**03 Create Your Free Account**
> Click Start Free Trial. You get free credits on signup, which covers everything in this video.

<!-- section: Find a phone number from a name and company -->

**04 Select Full Name as Input, LinkedIn Profile URL as Output**
> Go to linkfinderai.com . In the "Select data type" dropdown, choose Full Name; in "Select output type", choose LinkedIn Profile URL.

**05 Enter the Lead's Full Name and Company**
> Type the full name into the name field — for example, Sarah Johnson — then enter their company in the company field, for example, Salesforce.

**06 Click "Enrich Data" to Get the LinkedIn URL**
> LinkFinder AI matches the name and company to a LinkedIn profile URL — you'll see a "Profile Data Found" notification with the result.

**07 Switch the Lookup to LinkedIn URL → Phone Number**
> Reopen the data type dropdowns: this time choose LinkedIn Profile URL as the input and Phone Number as the output.

**08 Paste the LinkedIn URL and Enrich Again**
> Paste the profile URL from step 3 into the input field and click "Enrich Data" — the result is the lead's phone number, for example +1 317 500 2454. This chained lookup uses two enrichment steps — one to find the LinkedIn URL, one to find the phone number — so it costs 2 credits total.

<!-- section: Find a phone number directly from a LinkedIn URL -->

**09 Select LinkedIn Profile URL as Input, Phone Number as Output**
> On linkfinderai.com , set the input type to LinkedIn Profile URL and the output type to Phone Number.

**10 Paste the URL and Click "Enrich Data"**
> Paste the profile URL you already have and run the lookup — the tool returns the matching phone number directly, with no LinkedIn search step first. Starting from a LinkedIn URL you already have costs 1 credit instead of 2, since it skips the name-to-URL step.

**11 Closing card**
> TODO: name the next action — start a free trial, or the next video in the series.

## Deliberately not in this video

- **Find a phone number programmatically via API** (3 steps) — its own video and its own landing page. Folding it in is what pushed the reference guidee to 67 steps.

## Embed snippet

Paste into `resources/find-phone-number-from-linkedin.html`, matching the pattern in `linkedin-profile-scraper.html`.

```html
<h2 style="font-size:1.75rem;font-weight:700;margin-bottom:1.25rem;">See it in action</h2>
<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
  <iframe
    src="https://www.youtube.com/embed/REPLACE_WITH_ID?rel=0&modestbranding=1"
    title="Find a Phone Number From LinkedIn With LinkFinder AI"
    style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"
    loading="lazy"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen></iframe>
</div>
```
