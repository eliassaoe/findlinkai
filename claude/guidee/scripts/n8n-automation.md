# Automate LinkedIn Enrichment In n8n With LinkFinder AI

| | |
| --- | --- |
| **Slug** | `n8n-automation` |
| **Target page** | `n8n-linkedin-automation.html` |
| **Enrichment** | `platform: n8n` — company_name_to_website, called through n8n's built-in HTTP Request node (per `n8n-linkedin-automation.html`, there is no dedicated LinkFinder AI n8n node — the page's own FAQ says "Use n8n's HTTP Request node... no plugin needed") |
| **Demo data** | `Tesla` -> `tesla.com` — same example as `api-quickstart`, kept identical since it is literally the same API call, just made from inside n8n instead of a terminal |
| **Length** | 16 steps, ~2 min |
| **Title score** | not yet scored — `vidiq_score_title` was out of credits when this pass was written. Score before recording. |
| **Written** | by hand from `template.md`. The request shape (endpoint, header, body) is copied verbatim from `api-documentation.html`, same as `api-quickstart.md` — n8n has no LinkFinder-specific UI to get wrong here, only its own standard HTTP Request node, which is generic n8n UI, not something to invent. |

## Cover

> In this video we are going to see how to automate LinkedIn enrichment in n8n using LinkFinder AI.

## Before you record

- Have an n8n canvas open with nothing else on it.
- Have your LinkFinder AI API key ready to paste, masked but for the last 4 characters.
- Pre-add the HTTP Request node so you are only filling in its parameters on camera, not searching the node panel at length.

## Click script

| # | Action | Target | Type |
| --- | --- | --- | --- |
| 01 | Hold | n8n canvas, HTTP Request node already executed, output pane showing `"result": "tesla.com"` | — |
| 02 | Click | first link in the video description | — |
| 03 | Click | `Start Free Trial` | — |
| 04 | Click | `API & MCP` tab | — |
| 05 | Click | `Copy` next to the API key | — |
| 06 | Switch | to the n8n canvas | — |
| 07 | Click | the `HTTP Request` node to open its parameters | — |
| 08 | Select | `Method` | `POST` |
| 09 | Fill | `URL` | `https://api.linkfinderai.com` |
| 10 | Toggle | `Send Headers` on, add `Authorization` | `Bearer YOUR_API_KEY` |
| 11 | Toggle | `Send Body` on, set body type to JSON | `{"type": "company_name_to_website", "input_data": "Tesla"}` |
| 12 | Click | `Execute step` (n8n's per-node test-run button) | — |
| 13 | Hold | output pane, `result: "tesla.com"` | — |
| 14 | Hold | credit balance in LinkFinder AI's dashboard, in a second tab | — |
| 15 | Closing card | — | — |

## Step cards

**01 What You End Up With**
> One node in an n8n workflow, and this comes back — a company's website, ready to feed into the next step. Here is how, in about two minutes.

**02 Open LinkFinder AI**
> Click the first link in the video description to open LinkFinder AI.

**03 Create Your Free Account**
> Click Start Free Trial. You get free credits on signup, which covers the call you are about to make.

**04 Open the API Tab**
> Click the API & MCP tab. Your API key is already generated — there is nothing to request.

**05 Copy Your Key**
> Click Copy next to your API key.

**06 Switch to n8n**
> Open your n8n workflow.

**07 Open the HTTP Request Node**
> Click the HTTP Request node. There is no dedicated LinkFinder AI node to install — the standard HTTP Request node calls the API directly.

**08 Set the Method**
> Set Method to POST.

**09 Set the URL**
> Set URL to the single LinkFinder AI endpoint — every enrichment type goes through the same address.

**10 Add the Authorization Header**
> Turn on Send Headers and add Authorization, set to Bearer followed by your API key.

**11 Add the Request Body**
> Turn on Send Body, set it to JSON, and add the type and input_data fields — company_name_to_website and Tesla. This pairing costs one credit.

**12 Run the Node**
> Click Execute step to test this node on its own, before it is wired into a bigger workflow.

**13 Read the Output**
> The output pane shows the same JSON you would get from a raw API call — result: tesla.com, status: success.

**14 Check What It Cost**
> One credit, deducted the moment the node ran — the same as if you had called the API directly.

## Closing card

**15 Wire It Into Your Workflow**
> Connect this node to whatever comes next — a CRM update, a Slack alert, a spreadsheet row — using the same JSON output. The free credits on signup are enough to build and test your workflow before you pay anything.

## YouTube

**Title:** Automate LinkedIn Enrichment In n8n With LinkFinder AI

**Description:**

```
Full guide → https://linkfinderai.com/n8n-linkedin-automation

No dedicated node to install — n8n's built-in HTTP Request node calls
LinkFinder AI directly. This video wires up one call end to end: get
your API key, configure the node, run it, and read the result — ready
to connect into any workflow.

00:00 What one workflow node returns
00:12 Creating a free account and finding your API key
00:30 Configuring the HTTP Request node
01:10 Running the node and reading the output
01:35 What it cost, and where to take it next

Free credits on signup — enough to build and test your own workflow.

#n8n #automation #api #dataenrichment #workflowautomation
```

## Embed snippet

Paste into `n8n-linkedin-automation.html`, matching how the existing
video pages do it (see `company-employee-finder.html`):

```html
    <div class="video-embed-wrap">
      <div class="video-responsive">
        <iframe src="https://www.youtube.com/embed/VIDEO_ID" title="LinkFinder AI demo video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe>
      </div>
    </div>
```

Then flip this row to `"status": "live"` in `catalog.json`.

## Voiceover

Not yet generated — `vidiq_voiceover_generate` was out of credits on the
connected account when this pass was written. Narration text above is
final and ready to synthesize (voice `iP95p4xoKVk53GoZ742B`, Chris, the
fixed voice per `METHOD.md`) once the account tops up. Save the result to
`claude/guidee/audio/n8n-automation-vo.mp3`.
