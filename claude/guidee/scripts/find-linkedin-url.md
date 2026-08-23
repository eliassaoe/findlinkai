# Find Someone's LinkedIn URL From Just Their Name With LinkFinder AI

| | |
| --- | --- |
| **Slug** | `find-linkedin-url` |
| **Target page** | `resources/find-linkedin-url.html` |
| **Derived from** | that page's own steps — keep the two in sync |
| **Length** | 12 steps, ~2 min |

## Cover

> In this video we are going to see how to find someone's LinkedIn URL from just their name using LinkFinder AI.

## Click script

Rehearse this before recording. Type each value in one go — a pause mid-field becomes two steps in the Guidde output.

| # | Action | Target | Notes |
| --- | --- | --- | --- |
| 01 | (hold on the finished result) | exported CSV / found value | the payoff, before the how |
| 02 | Click | first link in the video description | — |
| 03 | Click | `Start Free Trial` | — |
| 04 | Click / Fill | `LinkedIn profile URL` | Open the LinkedIn URL Finder |
| 05 | Click / Fill | `Enter Full Name` | Enter the lead's full name |
| 06 | Click / Fill | `Company Name` | Add the company name |
| 07 | Click / Fill | `—` | Narrow it down with location and job title (optional) |
| 08 | Click / Fill | `Enrich Data` | Click "Enrich Data" to get the URL |
| 09 | Click / Fill | `Upload CSV (bulk)` | Switch to "Upload CSV (bulk)" |
| 10 | Click / Fill | `Select File` | Select your CSV file |
| 11 | Click / Fill | `—` | Preview the data and pick the format |
| 12 | Click / Fill | `Process items` | Process the list and export results |
| 13 | (closing card) | — | — |

## Step cards

Narration lifted from the page, then tightened for speech. Anything still reading like prose needs a second pass — see STYLE.md.

**01 What You End Up With**
> TODO: one sentence naming the result the viewer is about to get.

**02 Open LinkFinder AI**
> Click the first link in the video description to open LinkFinder AI.

**03 Create Your Free Account**
> Click Start Free Trial. You get free credits on signup, which covers everything in this video.

<!-- section: Find a single LinkedIn URL from a name -->

**04 Open the LinkedIn URL Finder**
> Go to linkfinderai.com and click on LinkedIn profile URL. You'll land on a form with a few input fields.

**05 Enter the Lead's Full Name**
> Click "Enter Full Name" and type the person's name — for example, Bill Gates.

**06 Add the Company Name**
> Click "Company Name" and enter the lead's employer — Microsoft, in this example. This is the single biggest factor in match accuracy, since it's what tells the tool which "Bill Gates" you mean.

**07 Narrow It Down with Location and Job Title (optional)**
> For very common names, add location and job title to filter further — here, USA and CEO. Both fields are optional and can be skipped for less common names.

**08 Click "Enrich Data" to Get the URL**
> The tool runs the lookup and returns the matching LinkedIn profile URL, ready to copy or open directly.

<!-- section: Bulk find LinkedIn URLs from a CSV list -->

**09 Switch to "Upload CSV (bulk)"**
> On the same LinkedIn URL Finder screen, choose the bulk upload option instead of the single-name form.

**10 Select your CSV File**
> Click "Select File" and choose a CSV with your leads' names and companies.

**11 Preview the Data and Pick the Format**
> Check that names, companies, locations, and job titles look right, then confirm the matching format — Full Name + Company Name, in this case.

**12 Process the List and Export Results**
> Click "Process items" to run the lookup on every row, then click "Export" to download the enriched list — each lead now paired with its LinkedIn URL — as a CSV. De-duplicate your list before uploading. Running the same name and company twice costs two lookups instead of one, and a clean list processes faster.

**13 Closing card**
> TODO: name the next action — start a free trial, or the next video in the series.

## Deliberately not in this video

- **Find LinkedIn URLs programmatically via API** (4 steps) — its own video and its own landing page. Folding it in is what pushed the reference guidee to 67 steps.

## Embed snippet

Paste into `resources/find-linkedin-url.html`, matching the pattern in `linkedin-profile-scraper.html`.

```html
<h2 style="font-size:1.75rem;font-weight:700;margin-bottom:1.25rem;">See it in action</h2>
<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
  <iframe
    src="https://www.youtube.com/embed/REPLACE_WITH_ID?rel=0&modestbranding=1"
    title="Find Someone's LinkedIn URL From Just Their Name With LinkFinder AI"
    style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"
    loading="lazy"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen></iframe>
</div>
```
