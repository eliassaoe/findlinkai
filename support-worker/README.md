# LinkFinder AI — Support Chat Worker

Replaces the old `@n8n/chat` widget, which pointed at a placeholder/cold-sleeping
webhook (`eliasse-n8n.onrender.com`) with no logic behind it. This Worker has
the actual logic — it calls Claude directly, knows the site's real pricing/
product/policy facts, can fetch live pages for anything it doesn't already
know, and can hand the conversation to you by email + a Calendly link.

## What it needs from you

This repo has no Cloudflare account access wired up, so I couldn't deploy this
for you — you'll need to run these steps yourself (5-10 minutes):

1. **Install Wrangler** (Cloudflare's CLI), if you don't have it:
   ```
   npm install -g wrangler
   wrangler login
   ```

2. **Get an Anthropic API key** at console.anthropic.com if you don't already
   have one, and set it as a secret:
   ```
   cd support-worker
   wrangler secret put ANTHROPIC_API_KEY
   ```
   (paste the key when prompted)

3. **Deploy:**
   ```
   wrangler deploy
   ```
   This prints a URL like `https://linkfinder-ai-support.<your-subdomain>.workers.dev`.

4. **Tell me that URL** (or paste it into `js/support-widget.js` yourself —
   it's the `WORKER_URL` constant at the top of the file) so the widget knows
   where to send chat requests.

That's it — the widget already replaced the broken embed on all 7 pages that
had it, it just needs a live Worker URL to talk to.

## Optional: automatic email on escalation

Right now, when the bot escalates to you, the widget shows the visitor a
"Talk to Eliasse" card with a pre-filled `mailto:` link and your Calendly link
— this works with zero extra setup, but only sends an email if the visitor
actually clicks it.

If you want an email to land in your inbox automatically the moment the bot
escalates (even if the visitor never clicks), sign up for a free Resend
account (resend.com — generous free tier, dead simple API) and set:
```
wrangler secret put RESEND_API_KEY
wrangler secret put SUPPORT_TO_EMAIL      # defaults to support@linkfinderai.com
wrangler secret put SUPPORT_FROM_EMAIL    # must be a domain you've verified in Resend
```
Redeploy (`wrangler deploy`) after adding secrets — no code changes needed.

## Updating the knowledge base

The system prompt in `worker.js` bakes in pricing, plans, credits, and policy
facts I verified directly from `pricing.html` and `integrations.html` on
2026-08-21. If pricing or plans change, update the `SYSTEM_PROMPT` constant
and redeploy. Everything else (guides, API reference details, exact
per-lookup credit costs) is fetched live from the site via the `fetch_page`
tool, so it stays current without a redeploy — but only for paths in the
`FETCHABLE_EXACT` / `FETCHABLE_PREFIXES` allow-list at the top of `worker.js`.
Add a page there if you want the bot able to pull from it.

## Note: one real inconsistency found in your docs

`openapi.json` says "every request costs 1 credit," but the actual product UI
(confirmed via screenshots from a recent video project) shows a LinkedIn→
email lookup costing 10 credits and a LinkedIn→phone lookup costing 50
credits. I did not guess which is right — the system prompt tells the bot to
fetch the live page and hedge rather than state a specific number from
memory. Worth reconciling `openapi.json` against the real product at some
point so the API docs aren't actively wrong.

## Cost

Model is `claude-haiku-4-5` — fast and inexpensive, appropriate for a support
chat with occasional tool calls. At realistic support-chat volumes this
should be a few dollars a month, not a meaningful line item.
