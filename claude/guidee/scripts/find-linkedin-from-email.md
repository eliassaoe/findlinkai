# Find a LinkedIn Profile From an Email Address With LinkFinder AI

| | |
| --- | --- |
| **Slug** | `find-linkedin-from-email` |
| **Target page** | `resources/find-linkedin-from-email.html` |
| **Derived from** | that page's own steps — keep the two in sync |
| **Length** | 10 steps, ~2 min |

## Cover

> In this video we are going to see how to find a LinkedIn profile from an email address using LinkFinder AI.

## Click script

Rehearse this before recording. Type each value in one go — a pause mid-field becomes two steps in the Guidde output.

| # | Action | Target | Notes |
| --- | --- | --- | --- |
| 01 | (hold on the finished result) | exported CSV / found value | the payoff, before the how |
| 02 | Click | first link in the video description | — |
| 03 | Click | `Start Free Trial` | — |
| 04 | Click / Fill | `—` | Set the input to Email Address |
| 05 | Click / Fill | `—` | Set the output to LinkedIn Profile URL |
| 06 | Click / Fill | `Enrich Data` | Enter the email and enrich |
| 07 | Click / Fill | `high confidence` | Check the confidence score |
| 08 | Click / Fill | `—` | Upload your CSV of email addresses |
| 09 | Click / Fill | `list` | Process the list |
| 10 | Click / Fill | `—` | Filter by confidence level |
| 11 | (closing card) | — | — |

## Step cards

Narration lifted from the page, then tightened for speech. Anything still reading like prose needs a second pass — see STYLE.md.

**01 What You End Up With**
> TODO: one sentence naming the result the viewer is about to get.

**02 Open LinkFinder AI**
> Click the first link in the video description to open LinkFinder AI.

**03 Create Your Free Account**
> Click Start Free Trial. You get free credits on signup, which covers everything in this video.

<!-- section: Find a LinkedIn profile from one email address -->

**04 Set the Input to Email Address**
> Select Email Address as the input data type on your dashboard.

**05 Set the Output to LinkedIn Profile URL**
> Choose LinkedIn Profile URL as the output type.

**06 Enter the Email and Enrich**
> Type in the email address — for example, bill.gates@microsoft.com — and click Enrich Data.

**07 Check the Confidence Score**
> Each match comes with a confidence indicator — a green "high confidence" label means the LinkedIn URL is very likely correct.

<!-- section: Reverse-lookup LinkedIn profiles in bulk, filtered by confidence -->

**08 Upload your CSV of Email Addresses**
> Switch to the bulk upload option and select a CSV file containing your list of emails.

**09 Process the List**
> Click Process items to run the reverse lookup on every email in the file.

**10 Filter by Confidence Level**
> Use the results filter to show all matches or only high-confidence ones, depending on how strict you want to be. Filtering to high-confidence matches only is the safest default when you're about to run outreach on the results.

**11 Closing card**
> TODO: name the next action — start a free trial, or the next video in the series.

## Deliberately not in this video

- **Reverse-lookup LinkedIn profiles programmatically via API** (2 steps) — its own video and its own landing page. Folding it in is what pushed the reference guidee to 67 steps.

## Embed snippet

Paste into `resources/find-linkedin-from-email.html`, matching the pattern in `linkedin-profile-scraper.html`.

```html
<h2 style="font-size:1.75rem;font-weight:700;margin-bottom:1.25rem;">See it in action</h2>
<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
  <iframe
    src="https://www.youtube.com/embed/REPLACE_WITH_ID?rel=0&modestbranding=1"
    title="Find a LinkedIn Profile From an Email Address With LinkFinder AI"
    style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"
    loading="lazy"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen></iframe>
</div>
```
