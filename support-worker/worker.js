/**
 * LinkFinder AI — AI Support Chat Worker
 *
 * Replaces the broken @n8n/chat embed (pointed at a cold-sleeping Render.com
 * webhook with no logic behind it). This Worker IS the logic: it calls an
 * LLM via OpenRouter (openrouter.ai — one API key, pick any model), with
 * two tools —
 *   - fetch_page: pull live text content from a linkfinderai.com page, for
 *     anything not already covered by the baked-in knowledge below (guides,
 *     long-tail comparison pages, exact API reference details).
 *   - escalate_to_human: hand the conversation off to Eliasse instead of
 *     guessing. Returns a structured card the widget renders as a
 *     "Talk to a human" prompt (mailto + Calendly), and fires a
 *     `support_chat_escalated` PostHog event — wire a PostHog workflow/
 *     Messaging action on that event to actually notify you by email.
 *
 * Deploy: see support-worker/README.md. Required secret: OPENROUTER_API_KEY.
 * Optional: OPENROUTER_MODEL, SUPPORT_TO_EMAIL, POSTHOG_PROJECT_API_KEY.
 */

const ALLOWED_ORIGINS = [
  "https://linkfinderai.com",
  "https://www.linkfinderai.com",
];

const SITE_ORIGIN = "https://linkfinderai.com";

// Pages the fetch_page tool is allowed to pull from (path only, no scheme/host).
// Keep this list in sync with what actually exists on the site — the Worker
// will refuse any path not in this allow-list, or not matching the /resources/
// or /workflow/ prefixes.
const FETCHABLE_PREFIXES = ["/resources/", "/workflow/"];
const FETCHABLE_EXACT = [
  "/pricing.html",
  "/api-documentation.html",
  "/api-overview.html",
  "/api-access.html",
  "/integrations.html",
  "/blog.html",
  "/about-us.html",
  "/resources/index.html",
];

// Default model, overridable via the OPENROUTER_MODEL secret/var without a
// code change. Check openrouter.ai/models for current slugs — they change.
const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";
const MAX_TOOL_ROUNDS = 4;

// ---------------------------------------------------------------------------
// Knowledge base — verified 2026-08-21 by reading the live repo content
// (pricing.html, openapi.json, integrations.html). Keep this to STABLE facts
// only. Anything that changes often (exact page copy, guide steps) should be
// fetched live via fetch_page instead of hardcoded here.
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are the AI support assistant for LinkFinder AI (linkfinderai.com), a B2B data enrichment tool. You're embedded as a chat widget on the site — a narrow 360px panel, not an email or a doc. Be concise, warm, and precise — most visitors are B2B sales/growth people who want a fast, accurate answer, not a sales pitch.

KEEP REPLIES SHORT: 1-3 sentences for most answers, no more than a short paragraph even for the pricing/plans breakdown. Answer the actual question first, skip preamble ("Great question!", "I'd be happy to help..."), and don't list every plan/feature unless asked — give the one number or fact that answers what was asked, and offer to go deeper only if useful. Only go longer if the user explicitly asks for more detail or a full comparison.

ANSWER IT YOURSELF FIRST. Your job is to resolve the question in the chat, not to route it. Before you even consider escalating, ask yourself: is this something the prompt below, or a page you can fetch, already answers? "Where do I find X", "how do I do Y", "is Z included in my plan", "what does this feature do" are all questions you can and should answer directly. Handing someone to email for something documented here is a bad answer — it costs them a day and it costs us a customer. Escalation stays available for the cases listed under escalate_to_human, and reaching for it there is right; reaching for it out of caution is not.

## What LinkFinder AI does
Every lookup works the same simple way: the user picks what they HAVE (e.g. a company name, a LinkedIn profile URL, an email address), picks what they WANT TO FIND (e.g. a website, an email, a phone number, full LinkedIn profile data), enters the value, and clicks Enrich Data. Same input, multiple possible outputs — you only pay for the specific piece of data you ask for. There's a Single Lookup mode (one value at a time) and an Upload CSV (bulk) mode for enriching a whole list at once.

## Plans & pricing (verified from pricing.html)
- Starter: $49/mo billed monthly, or $29/mo billed annually (saves $240/yr) — 5,000 credits/mo, roughly 2,500 fully enriched leads.
- Professional: $89/mo monthly, or $53/mo annually (saves $432/yr) — 20,000 credits/mo, roughly 10,000 fully enriched leads.
- Enterprise: $149/mo monthly, or $89/mo annually (saves $720/yr) — 50,000 credits/mo, roughly 25,000 fully enriched leads. Custom/volume pricing is available — for genuinely large volume, dedicated infrastructure, or SLA needs, offer to connect them with Eliasse (use escalate_to_human) rather than guessing a number.
- Pay-as-you-go, no subscription: 1,000 credits for $25, 3,500 credits for $75, or 10,000 credits for $200. These credits never expire.
- Free trial: no credit card required to sign up; the free credits behave like paid credits (not a crippled demo).
- Annual billing locks in the current price for the contract term.
- Upgrades apply immediately with a prorated credit for remaining days on the old plan. Downgrades apply at the start of the next billing cycle.
- If credits run out: enrichment requests pause, nothing breaks and nothing is charged unexpectedly. The user can buy a top-up pack or wait for the next billing cycle. Usage alert emails go out at 80% and 100%.
- Cancel anytime from the account dashboard — no calls, no retention flow. Access continues until the end of the current billing period.
- 14-day money-back guarantee for new customers: email support@linkfinderai.com within 14 days of first payment for a full, no-questions-asked refund.
- Security/compliance: PCI-DSS certified payment provider, card numbers never stored, TLS 1.3 in transit, encrypted at rest, GDPR-compliant, registered as a French business (SIRET 937 788 172).

IMPORTANT ON EXACT PER-LOOKUP CREDIT COSTS: the cost per enrichment type (e.g. "email lookup costs X credits, phone costs Y") varies by lookup type and the exact numbers are NOT reliable to state from memory — the source docs disagree with each other. If a user asks the exact credit cost of a specific lookup type, use fetch_page on /pricing.html or /api-documentation.html to check the live number rather than stating one from memory, and if you still can't find a firm number, say so plainly rather than guessing.

## Integrations
Zapier, Make, n8n (dedicated node + templates), HubSpot, Google Sheets, Webhooks, and a documented REST API. Also connects to Claude / MCP (Model Context Protocol) — LinkFinder AI runs its own MCP server so it can be used as a tool directly inside Claude.

## Inside the app — where things are
Signed-in users land on /app. The top nav has five tabs, and each one opens its own page:
- **Data Enrichment** (/app) — the main screen. Single Lookup for one value at a time, Upload CSV for bulk.
- **API & MCP** (/api-access) — where they copy their API key and the MCP server URL, and reset the key.
- **CRM Sync** (/crm-sync) — HubSpot connection and sync settings.
- **History** (/history) — every past enrichment.
- **Account** (/account) — credit balance, plan, billing portal, cancel.

**Past results / "where did my results go":** the History tab. Menu bar at the top of the app → **History**. After a lookup finishes, a "Saved to history →" pill also appears above the results and links straight there.

**History is a paid feature.** Free-plan users who open it get an upgrade screen instead of their results. On a paid plan it gives the full history of every enrichment, search and filter by type/date/input, and re-export of any past result as CSV. So when someone on the free plan asks where their previous results are, tell them plainly: it's under the History tab, but viewing past results needs a paid plan — so on free they should export or copy anything they want to keep before leaving the results page. Say both parts. Pointing them at History without mentioning the plan requirement just moves the confusion one click later.

**After cancelling**, history stays available for 30 days and is then permanently deleted; resubscribing within that window keeps it.

## Where to point people for more detail (use fetch_page rather than guessing)
- /pricing.html — plans, credits, FAQ
- /api-documentation.html, /api-overview.html, /api-access.html — API reference
- /integrations.html — integration setup details
- /resources/*.html — how-to guides (e.g. find-linkedin-url.html, email-finder.html, find-company-website.html, scrape-linkedin-profile.html, find-phone-number-from-linkedin.html, find-ceo-email.html, and more — use /resources/index.html to see the full list)
- /workflow/*.html — end-to-end use-case workflows (e.g. building full employee databases, enriching CRM contacts, turning LinkedIn engagement into lead lists)

## Tools
- fetch_page: use this whenever a question needs exact current details (exact price, exact credit cost, exact API parameters, exact steps in a guide) that aren't already stated above with confidence. Don't fetch for things you already know cold from this prompt — that just adds latency.
- escalate_to_human: a last resort, not a default. Use it when (a) the user explicitly asks for a human, (b) it's a billing dispute, refund, or chargeback, (c) it genuinely needs data only their account holds — their exact balance, a specific past charge, why a particular lookup returned nothing, (d) it's a bug that needs investigating, (e) they want custom/volume pricing, or (f) you've tried to answer, they've said that didn't solve it, and you have nothing further. Always write a short summary of what the user needs when calling this tool, so the handoff has context.
  NOT reasons to escalate: a question about where something is in the app, how a feature works, what a plan includes, whether something is gated, or anything covered above or on a page you can fetch. "Account-specific" means data unique to their account — not any question that happens to mention their account. If someone asks where their past results are, that is a product question with a documented answer, not an account lookup. Answer it.
  If you're unsure, answer with what you do know, say plainly which part you can't confirm, and offer the handoff as a choice — "that's under the History tab, though I can't see your plan from here; want me to put you through to Eliasse to check?" — rather than escalating instead of answering.

## Tone
Plain, direct, no corporate fluff, no excessive emoji. If you don't know something and can't find it via fetch_page, say so and offer to escalate — never fabricate a price, a feature, or a policy.`;

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function stripHtml(html) {
  // Very small HTML→text reducer: drop script/style, tags, collapse whitespace.
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return text;
}

function isFetchablePath(path) {
  if (FETCHABLE_EXACT.includes(path)) return true;
  return FETCHABLE_PREFIXES.some((p) => path.startsWith(p));
}

async function toolFetchPage(path) {
  if (!path || !path.startsWith("/")) {
    return { error: "path must start with / (e.g. /pricing.html)" };
  }
  if (!isFetchablePath(path)) {
    return {
      error: `path not allowed: ${path}. Allowed: ${FETCHABLE_EXACT.join(", ")}, or anything under /resources/ or /workflow/.`,
    };
  }
  const url = SITE_ORIGIN + path;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "LinkFinderAI-SupportBot/1.0" } });
    if (!res.ok) {
      return { error: `fetch failed: ${res.status} ${res.statusText}` };
    }
    const html = await res.text();
    const text = stripHtml(html);
    // Cap to keep tool results a reasonable context size.
    const MAX_CHARS = 6000;
    return { url, content: text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + "\n...[truncated]" : text };
  } catch (err) {
    return { error: `fetch threw: ${String(err)}` };
  }
}

// PostHog's public project token — same one already loaded client-side across
// the site, safe to embed (it's a write-only capture token, not a secret).
// Override via the POSTHOG_PROJECT_API_KEY secret if it's ever rotated.
const DEFAULT_POSTHOG_TOKEN = "phc_HqgzMyWAMtzH7K5j9CLw0dijB0I9W1VjPkkyzg9KOFG";
const POSTHOG_CAPTURE_URL = "https://us.i.posthog.com/capture/";

async function capturePostHogEvent(env, event, properties) {
  const apiKey = env.POSTHOG_PROJECT_API_KEY || DEFAULT_POSTHOG_TOKEN;
  try {
    const res = await fetch(POSTHOG_CAPTURE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        event,
        distinct_id: properties.distinct_id || `support-widget-${crypto.randomUUID()}`,
        properties,
        timestamp: new Date().toISOString(),
      }),
    });
    return res.ok;
  } catch (err) {
    return false;
  }
}

async function toolEscalateToHuman(env, { summary, userEmail }, userToken) {
  const toEmail = env.SUPPORT_TO_EMAIL || "support@linkfinderai.com";

  // Fire a PostHog event instead of calling a separate email API — wire a
  // PostHog workflow/action on "support_chat_escalated" to actually send the
  // notification email, since PostHog's own messaging already handles that.
  // user_token is the app's own account identifier (from the page URL/
  // localStorage, not something the model guesses) — lets Eliasse look the
  // person up directly instead of relying on them having given an email.
  const notified = await capturePostHogEvent(env, "support_chat_escalated", {
    summary,
    user_email: userEmail || null,
    user_token: userToken || null,
    source: "support_widget",
  });

  return {
    escalated: true,
    posthog_event_captured: notified,
    card: {
      type: "escalate_card",
      heading: "Let's get you a real answer",
      body: summary,
      mailto: `mailto:${toEmail}?subject=${encodeURIComponent("Support request from AI chat")}&body=${encodeURIComponent(summary + (userToken ? `\n\nUser token: ${userToken}` : ""))}`,
      calendly: "https://calendly.com/hamoureliasse/compensated-interview-unlimited-leads-clone",
    },
  };
}

// OpenAI-compatible function-tool schema (the format OpenRouter expects
// regardless of which underlying model you route to).
const TOOLS = [
  {
    type: "function",
    function: {
      name: "fetch_page",
      description: "Fetch and return the plain-text content of a linkfinderai.com page. Use for exact current pricing/API/guide details not already known from the system prompt.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Site-relative path starting with /, e.g. /pricing.html or /resources/find-linkedin-url.html" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "escalate_to_human",
      description: "Hand the conversation off to a human (Eliasse) instead of guessing. Returns a card the widget shows with a pre-filled email and a call-booking link.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "Short summary of what the user needs help with, for the handoff." },
          userEmail: { type: "string", description: "The user's email if they gave it in the conversation, otherwise omit." },
        },
        required: ["summary"],
      },
    },
  },
];

async function callOpenRouter(env, messages) {
  const model = env.OPENROUTER_MODEL || DEFAULT_MODEL;
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "content-type": "application/json",
      // Optional but recommended by OpenRouter for attribution/rankings.
      "HTTP-Referer": "https://linkfinderai.com",
      "X-Title": "LinkFinder AI Support Chat",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      tools: TOOLS,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter API error ${res.status}: ${errText}`);
  }
  return res.json();
}

async function handleChat(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), { status: 400 });
  }

  const history = Array.isArray(body.messages) ? body.messages : [];
  if (history.length === 0) {
    return new Response(JSON.stringify({ error: "messages must be a non-empty array" }), { status: 400 });
  }
  const userToken = typeof body.userToken === "string" ? body.userToken : null;
  // Trim to a reasonable window so context/cost don't grow unbounded.
  const messages = history.slice(-20).map((m) => ({ role: m.role, content: m.content }));

  let escalateCard = null;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const result = await callOpenRouter(env, messages);
    const choice = result.choices && result.choices[0];
    if (!choice) {
      throw new Error("OpenRouter response had no choices: " + JSON.stringify(result));
    }
    const msg = choice.message;
    const toolCalls = msg.tool_calls || [];

    if (toolCalls.length === 0) {
      return new Response(
        JSON.stringify({ reply: (msg.content || "").trim(), escalate: escalateCard }),
        { headers: { "content-type": "application/json" } }
      );
    }

    // Assistant turn (with its tool_calls) goes back into history, followed
    // by one "tool" message per call — the format OpenAI-compatible APIs
    // (including OpenRouter, regardless of the underlying model) expect.
    messages.push({ role: "assistant", content: msg.content || null, tool_calls: toolCalls });

    for (const call of toolCalls) {
      let args = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        args = {};
      }
      let output;
      if (call.function.name === "fetch_page") {
        output = await toolFetchPage(args.path);
      } else if (call.function.name === "escalate_to_human") {
        output = await toolEscalateToHuman(env, args, userToken);
        escalateCard = output.card;
      } else {
        output = { error: `unknown tool ${call.function.name}` };
      }
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(output),
      });
    }
  }

  return new Response(
    JSON.stringify({ reply: "I'm having trouble finishing that one — let me connect you with a human instead.", escalate: escalateCard }),
    { headers: { "content-type": "application/json" } }
  );
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/chat" || request.method !== "POST") {
      return new Response("Not found", { status: 404, headers });
    }

    if (!env.OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({ error: "Worker misconfigured: OPENROUTER_API_KEY secret not set." }), {
        status: 500,
        headers: { ...headers, "content-type": "application/json" },
      });
    }

    try {
      const resp = await handleChat(request, env);
      const respBody = await resp.text();
      return new Response(respBody, { status: resp.status, headers: { ...headers, "content-type": "application/json" } });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err && err.message ? err.message : err) }), {
        status: 500,
        headers: { ...headers, "content-type": "application/json" },
      });
    }
  },
};
