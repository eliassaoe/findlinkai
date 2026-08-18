# Find LinkedIn URLs From Names in Google Sheets With LinkFinder AI

| | |
| --- | --- |
| **Slug** | `find-linkedin-url-google-sheets` |
| **Target page** | `resources/find-linkedin-url-google-sheets.html` |
| **Derived from** | that page's own steps — keep the two in sync |
| **Length** | 14 steps, ~2 min |

## Cover

> In this video we are going to see how to find LinkedIn URLs from names in Google Sheets using LinkFinder AI.

## Click script

Rehearse this before recording. Type each value in one go — a pause mid-field becomes two steps in the Guidde output.

| # | Action | Target | Notes |
| --- | --- | --- | --- |
| 01 | (hold on the finished result) | exported CSV / found value | the payoff, before the how |
| 02 | Click | first link in the video description | — |
| 03 | Click | `Start Free Trial` | — |
| 04 | Click / Fill | `—` | Export your names and companies as a CSV |
| 05 | Click / Fill | `Upload CSV (bulk).` | Open the LinkedIn URL Finder and upload the CSV |
| 06 | Click / Fill | `Name + Company → LinkedIn URL` | Run the "Name + Company → LinkedIn URL" search |
| 07 | Click / Fill | `Export to download the same lis` | Export the enriched results |
| 08 | Click / Fill | `Replace spreadsheet` | Bring it back into Google Sheets |
| 09 | Click / Fill | `Create workflow.` | Create a new workflow |
| 10 | Click / Fill | `On row added` | Set the trigger to "On row added" |
| 11 | Click / Fill | `—` | Add an HTTP Request node calling the LinkedIn URL endpoint |
| 12 | Click / Fill | `Import cURL` | Import the cURL example and add your API key |
| 13 | Click / Fill | `Update row in sheet` | Add "Update row in sheet" as the last step |
| 14 | Click / Fill | `Bill Gates Microsoft` | Test it: type a name into the sheet |
| 15 | (closing card) | — | — |

## Step cards

Narration lifted from the page, then tightened for speech. Anything still reading like prose needs a second pass — see STYLE.md.

**01 What You End Up With**
> TODO: one sentence naming the result the viewer is about to get.

**02 Open LinkFinder AI**
> Click the first link in the video description to open LinkFinder AI.

**03 Create Your Free Account**
> Click Start Free Trial. You get free credits on signup, which covers everything in this video.

<!-- section: One-time bulk enrichment via CSV -->

**04 Export your Names and Companies as a CSV**
> From your Google Sheet, go to File → Download → Comma Separated Values (.csv) .

**05 Open the LinkedIn URL Finder and Upload the CSV**
> Go to linkfinderai.com , select LinkedIn URL Finder, and switch to "Upload CSV (bulk)."

**06 Run the "Name + Company → LinkedIn URL" Search**
> Pick the matching popular search — Find LinkedIn Profile URL: Name + Company → LinkedIn URL — then process the list.

**07 Export the Enriched Results**
> Once processing finishes, click Export to download the same list with a LinkedIn URL column added.

**08 Bring It Back into Google Sheets**
> Back in Sheets, go to File → Import , upload the enriched CSV, and choose "Replace spreadsheet" (or import as a new sheet if you'd rather keep the original). This is a one-time pass — new rows added after this point won't have a LinkedIn URL until you export and re-run it. For a sheet that keeps growing, the automated method below fills each new row on its own.

<!-- section: Fully automated: auto-fill on every new row -->

**09 Create a New Workflow**
> From your LinkFinder AI dashboard, open Workflows and click "Create workflow."

**10 Set the Trigger to "On Row Added"**
> Connect the workflow to your Google Sheet and set it to fire whenever a new row is added — this is what makes it automatic instead of something you re-run by hand.

**11 Add an HTTP Request Node Calling the LinkedIn URL Endpoint**
> Add an HTTP Request step. Rather than building the request by hand, grab the ready-made example from the API docs — open API documentation → B2B Data Lookup → "Find a person's LinkedIn URL from their full name and company" and copy the cURL example, which already has type set to lead_full_name_to_linkedin_url .

**12 Import the cURL Example and Add your API Key**
> Paste the cURL command in with "Import cURL" so the request is pre-filled, then swap in your real API key.

**13 Add "Update Row in Sheet" as the Last Step**
> Add a final action that writes the returned LinkedIn URL back into the same row it came from, then publish the workflow.

**14 Test It: Type a Name into the Sheet**
> With the workflow published, add a new row — name and company, e.g. "Bill Gates Microsoft" — and the LinkedIn URL fills in on its own, no manual step required. Each row still costs 1 credit when the workflow runs it, exactly like a manual lookup — automating it removes the manual work, not the cost. Keep an eye on your credit balance if the sheet gets a lot of new rows.

**15 Closing card**
> TODO: name the next action — start a free trial, or the next video in the series.

## Embed snippet

Paste into `resources/find-linkedin-url-google-sheets.html`, matching the pattern in `linkedin-profile-scraper.html`.

```html
<h2 style="font-size:1.75rem;font-weight:700;margin-bottom:1.25rem;">See it in action</h2>
<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
  <iframe
    src="https://www.youtube.com/embed/REPLACE_WITH_ID?rel=0&modestbranding=1"
    title="Find LinkedIn URLs From Names in Google Sheets With LinkFinder AI"
    style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"
    loading="lazy"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen></iframe>
</div>
```
