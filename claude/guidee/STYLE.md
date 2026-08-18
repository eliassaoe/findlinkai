# Guidee house style

Distilled from `Perform LinkedIn Profile Scraping With LinkFinder AI`
(67 steps, the reference guidee). Two halves: what to keep, and what that
guidee got wrong that should not be cloned.

## Keep

- **Cover page**: `<Action> With LinkFinder AI`, then one sentence starting
  "In this video we are going to see how to ...".
- **Numbered step cards**: a two-to-five word imperative title, then one
  sentence of narration underneath.
- **Narration opens with the verb the viewer performs**: `Click ...`,
  `Fill in ...`, `Select ...`. It matches what their cursor is doing.
- **Real demo data, never placeholders**: Salesforce, Microsoft, Tesla.
  `John Doe` reads as a mockup and kills trust.
- **One tool, one flow, start to finish** — the viewer sees a result, not a
  tour of the settings.

## Fix

These are real defects in the reference guidee. Do not carry them forward.

1. **67 steps is two or three videos, not one.**
   It covers name→URL, profile scrape, company scrape, bulk CSV *and* the
   API/MCP docs. Each of those is its own video and its own landing page.
   **Target 22–35 steps, 2–4 minutes.** Above 40, split it.

2. **Steps 43–53 are eleven near-duplicate CSV steps.**
   `Fill CSV File Path` / `Upload CSV File` alternating five times over is
   Guidde faithfully recording someone fumbling with a file picker. Rehearse
   the click script before recording, and delete duplicate steps afterwards.

3. **Recording artifacts became steps.**
   `03 Enter Lead's Initials` then `04 Enter Lead's Full Name` is one action
   split in two because the recorder caught a search-as-you-type pause. Type
   the full value in one go.

4. **The narration describes the UI instead of the outcome.**
   `Click Enrich Data to begin extracting information from the LinkedIn
   profile` tells the viewer what they can already see. Every third step or
   so should say what they *get*:
   > Click Enrich Data. In about ten seconds you have their job title,
   > company, location and connection count — without opening LinkedIn.

5. **No hook and no ending.**
   The reference guidee stops dead on step 67, mid-API-docs. Every video
   needs:
   - **Step 01 is the payoff, not the login.** Show the finished result
     first — the exported CSV, the found email — then go back and show how.
   - **A final step** that names the next action: start a free trial, or
     watch the video for the next enrichment.

6. **Every result step should show a real value.**
   Blur or swap the personal data if needed, but a visibly empty result
   panel makes the product look broken.

## Wording rules

- Second person, present tense. "You select", never "the user selects".
- No hedging: "this will find" not "this should be able to find".
- Name the credit cost out loud once, on the first enrichment step. Viewers
  ask that question and the answer is cheap.
- British/American spelling: American, to match the site.
- Never say "simply", "just", or "easily".
