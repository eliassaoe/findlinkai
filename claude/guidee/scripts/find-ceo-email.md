# Find a CEO's Email Address With LinkFinder AI

| | |
| --- | --- |
| **Slug** | `find-ceo-email` |
| **Target page** | `resources/find-ceo-email.html` |
| **Derived from** | that page's own steps — keep the two in sync |
| **Demo data** | `tesla.com`, filtered to C-Suite, 5 results · then that CEO's LinkedIn profile URL |
| **Length** | 12 steps, ~2 min |
| **Title score** | not yet scored — `vidiq_score_title` was out of credits when this pass was written. Score before recording; this exact title is also what `CLAUDE.md` cites as the canonical tutorial-search example, so it should score well, but confirm rather than assume. |
| **Tightened** | narration and click-script targets filled in from `app-ui.md`; a first draft from `derive.py` had placeholder targets and two TODOs |

## Cover

> In this video we are going to see how to find a CEO's email address using LinkFinder AI.

## Click script

Rehearse this before recording. Type each value in one go — a pause mid-field becomes two steps in the Guidde output.

| # | Action | Target | Type |
| --- | --- | --- | --- |
| 01 | Hold | finished result: the CEO's name, title, and verified email on screen | — |
| 02 | Click | first link in the video description | — |
| 03 | Click | `Start Free Trial` | — |
| 04 | Click | `I have` | — |
| 05 | Select | `Company Domain` | — |
| 06 | Click | `I want to find` | — |
| 07 | Select | `Company Employees List` | — |
| 08 | Select | `Seniority` | `C-Suite` |
| 09 | Fill | `Number of employees` | `5` |
| 10 | Fill | `Enter Company Domain` | `tesla.com` |
| 11 | Click | `Enrich Data` | — |
| 12 | Hold | results list, CEO's row visible with name/title/LinkedIn URL | — |
| 13 | Click | the CEO's row | — |
| 14 | Click | `Copy` next to `LinkedIn URL` | — |
| 15 | Click | `I have` | — |
| 16 | Select | `LinkedIn Profile URL` | — |
| 17 | Click | `I want to find` | — |
| 18 | Select | `Email Address` | — |
| 19 | Paste | `Enter LinkedIn Profile URL` | the copied URL |
| 20 | Click | `Enrich Data` | — |
| 21 | Hold | result panel showing the returned email | — |
| 22 | Closing card | — | — |

## Step cards

**01 What You End Up With**
> This is a company's CEO, matched by title from a domain alone, with a verified email next to their name — that is what we are building in the next two minutes.

**02 Open LinkFinder AI**
> Click the first link in the video description to open LinkFinder AI.

**03 Create Your Free Account**
> Click Start Free Trial. You get free credits on signup, which covers everything in this video.

<!-- section: Find executives by seniority level at a company -->

**04 Open the Input Dropdown**
> On your dashboard, open the I have dropdown.

**05 Choose Company Domain**
> Select Company Domain.

**06 Open the Output Dropdown**
> Open I want to find.

**07 Choose Company Employees List**
> Select Company Employees List. This one is priced per person found — half a credit each — not a flat rate, so a tight filter keeps the cost down.

**08 Filter to C-Suite**
> Set Seniority to C-Suite, so the results are the executives who actually run the company, not every employee on LinkedIn.

**09 Set How Many Results You Want**
> Set Number of employees to 5. You only need the CEO, but a small buffer catches title variations like "Chief Executive Officer" versus "Co-CEO."

**10 Enter the Company Domain**
> Type the domain, not the company name — tesla.com, not Tesla.

**11 Click Enrich Data**
> LinkFinder AI returns the matching C-Suite executives at that domain.

**12 Find the CEO**
> Scan the results for the CEO's row — name, title, and LinkedIn URL are all there.

**13 Open Their Row**
> Click their row to expand the full result.

**14 Copy Their LinkedIn URL**
> Click Copy next to LinkedIn URL.

<!-- section: Enrich the CEO's LinkedIn profile into a verified email -->

**15 Switch The Input Type**
> Click the I have dropdown again.

**16 Choose LinkedIn Profile URL**
> Select LinkedIn Profile URL.

**17 Open The Output Dropdown**
> Click the I want to find dropdown.

**18 Choose Email Address**
> Select Email Address. This pairing costs ten credits, since it is checked for deliverability before it comes back.

**19 Paste The Profile URL**
> Paste the LinkedIn URL you just copied.

**20 Click Enrich Data**
> LinkFinder AI returns the CEO's verified email tied to that exact profile — not a guessed name@domain.com pattern.

**21 Confirm the Result**
> There is the email. Two lookups, one filtered by title and one by profile, got you from a bare domain to a CEO's real inbox.

## Closing card

**22 Try It On Your Own Target**
> Swap tesla.com for a company you are actually prospecting, and C-Suite for whatever seniority you need — the free credits on signup are enough to prove it before you pay anything.

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

## Voiceover

Not yet generated — `vidiq_voiceover_generate` was out of credits on the
connected account when this pass was written. Narration text above is
final and ready to synthesize (voice `iP95p4xoKVk53GoZ742B`, Chris, the
fixed voice per `METHOD.md`) once the account tops up. Save the result to
`claude/guidee/audio/find-ceo-email-vo.mp3`.
