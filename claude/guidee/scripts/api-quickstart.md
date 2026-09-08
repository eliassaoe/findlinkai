# Make Your First LinkFinder AI API Call In Under 2 Minutes

| | |
| --- | --- |
| **Slug** | `api-quickstart` |
| **Target page** | `api-access.html` |
| **Enrichment** | `platform: api` — company_name_to_website, called directly over REST |
| **Demo data** | `Tesla` -> `tesla.com` — the exact example already used in `api-documentation.html`'s own quickstart, kept identical so the video and the docs never disagree |
| **Length** | 16 steps, ~1 min 30 s — deliberately the shortest video in the catalog, matching the title's own "under 2 minutes" promise |
| **Title score** | not yet scored — `vidiq_score_title` was out of credits when this pass was written. Score before recording. |
| **Written** | by hand from `template.md`. Every curl/response line below is copied verbatim from `api-documentation.html` (lines ~391-450) — do not paraphrase the JSON or the endpoint. |

## Cover

> In this video we are going to see how to make your first LinkFinder AI API call using LinkFinder AI.

## Before you record

- Have a terminal window ready, already `cd`'d somewhere with nothing else on screen.
- Have your real API key ready to paste — mask everything but the last 4 characters on screen, or use a revoked/throwaway key and mention that.
- Type the curl command in one go, or have it pre-typed and just hit Enter, so Guidde doesn't split it into multiple steps.

## Click script

| # | Action | Target | Type |
| --- | --- | --- | --- |
| 01 | Hold | terminal showing the finished JSON response, `"result": "tesla.com"` | — |
| 02 | Click | first link in the video description | — |
| 03 | Click | `Start Free Trial` | — |
| 04 | Click | `API & MCP` tab | — |
| 05 | Hold | `Your API Key` card, key visible (masked in post) | — |
| 06 | Click | `Copy` next to the API key | — |
| 07 | Switch | to the terminal window | — |
| 08 | Type | the curl command below, API key pasted in place of `YOUR_API_KEY` | — |
| 09 | Press | Enter | — |
| 10 | Hold | the JSON response printed in the terminal | — |
| 11 | Click | back to the browser, `View API Docs` | — |
| 12 | Hold | the full list of `type` values in the docs (scroll briefly) | — |
| 13 | Closing card | — | — |

Curl command (verbatim from `api-documentation.html`):

```
curl -X POST "https://api.linkfinderai.com" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_API_KEY" \
     -d '{
       "type": "company_name_to_website",
       "input_data": "Tesla"
     }'
```

Response:

```
{
  "result": "tesla.com",
  "status": "success"
}
```

## Step cards

**01 What You End Up With**
> One HTTP request, and this comes back — a company's website, returned as clean JSON. Here is the whole thing, start to finish, in under a minute and a half.

**02 Open LinkFinder AI**
> Click the first link in the video description to open LinkFinder AI.

**03 Create Your Free Account**
> Click Start Free Trial. You get free credits on signup, which covers the call you are about to make.

**04 Open the API Tab**
> Click the API & MCP tab.

**05 Find Your API Key**
> Your API key is generated automatically the moment you sign up — there is nothing to request or wait on.

**06 Copy Your Key**
> Click Copy next to your API key.

**07 Switch To Your Terminal**
> Open a terminal.

**08 Write The Request**
> Every request goes to the same single endpoint. You only change one field, type, to pick the enrichment — here it is company_name_to_website, with Tesla as the input.

**09 Send It**
> Press Enter.

**10 Read The Response**
> Status success, and result is tesla.com — one credit spent, one field back, no dashboard involved.

**11 Check The Full Docs**
> Click View API Docs to see the rest.

**12 See What Else Is Available**
> Every dropdown pairing on the dashboard has a matching type value here — swap company_name_to_website for any of them and the request shape stays identical.

## Closing card

**13 Make Your Own Call**
> Copy your own API key from the API & MCP tab and run this exact request with your own company name — the free credits on signup cover more than enough calls to build against.

## YouTube

**Title:** Make Your First LinkFinder AI API Call In Under 2 Minutes

**Description:**

```
Full guide → https://linkfinderai.com/api-access

One HTTP request, one JSON response — no dashboard, no SDK to install.
This is the exact quickstart example from the API docs: swap in your own
API key, change one field, get structured data back.

00:00 What one API call returns
00:10 Creating a free account and finding your API key
00:25 Writing the request
00:40 Reading the response
01:00 Where to find every other enrichment type

Free credits on signup — enough to build against the API before you pay
anything.

#api #developertools #b2bsales #dataenrichment #restapi
```

## Embed snippet

Paste into `api-access.html`, matching how the existing video pages do it (see `company-employee-finder.html`):

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
`claude/guidee/audio/api-quickstart-vo.mp3`.
