/**
 * LinkFinder AI — AI Support Chat Worker
 *
 * Replaces the broken @n8n/chat embed (pointed at a cold-sleeping Render.com
 * webhook with no logic behind it). This Worker IS the logic: it calls the
 * Anthropic API directly, with two tools —
 *   - fetch_page: pull live text content from a linkfinderai.com page, for
 *     anything not already covered by the baked-in knowledge below (guides,
 *     long-tail comparison pages, exact API reference details).
 *   - escalate_to_human: hand the conversation off to Eliasse instead of
 *     guessing. Returns a structured card the widget renders as a
 *     "Talk to a human" prompt (mailto + Calendly), and — only if a
 *     RESEND_API_KEY secret is configured — also fires an actual email so
 *     support@linkfinderai.com gets notified even if the visitor never
 *     clicks the mailto link.
 *
 * Deploy: see support-worker/README.md. Required secret: ANTHROPIC_API_KEY.
 * Optional secrets: RESEND_API_KEY, SUPPORT_TO_EMAIL, SUPPORT_FROM_EMAIL.
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

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOOL_ROUNDS = 4;

// ---------------------------------------------------------------------------
// Knowledge base — verified 2026-08-21 by reading the live repo content
// (pricing.html, openapi.json, integrations.html). Keep this to STABLE facts
// only. Anything that changes often (exact page copy, guide steps) should be
// fetched live via fetch_page instead of hardcoded here.
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are the AI support assistant for LinkFinder AI (linkfinderai.com), a B2B data enrichment tool. You're embedded as a chat widget on the site. Be concise, warm, and precise — most visitors are B2B sales/growth people who want a fast, accurate answer, not a sales pitch.

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

## Where to point people for more detail (use fetch_page rather than guessing)
- /pricing.html — plans, credits, FAQ
- /api-documentation.html, /api-overview.html, /api-access.html — API reference
- /integrations.html — integration setup details
- /resources/*.html — how-to guides (e.g. find-linkedin-url.html, email-finder.html, find-company-website.html, scrape-linkedin-profile.html, find-phone-number-from-linkedin.html, find-ceo-email.html, and more — use /resources/index.html to see the full list)
- /workflow/*.html — end-to-end use-case workflows (e.g. building full employee databases, enriching CRM contacts, turning LinkedIn engagement into lead lists)

## Tools
- fetch_page: use this whenever a question needs exact current details (exact price, exact credit cost, exact API parameters, exact steps in a guide) that aren't already stated above with confidence. Don't fetch for things you already know cold from this prompt — that just adds latency.
- escalate_to_human: use this when (a) the user explicitly asks for a human / to talk to someone / mentions a billing dispute, refund, or account-specific issue you can't resolve, (b) the question needs account access you don't have (their specific account status, a specific past charge, a bug report that needs investigation), (c) you're not confident in an answer after trying fetch_page, or (d) the conversation is going in circles. Don't be shy about escalating — a fast, honest "let me connect you with Eliasse" beats a confident wrong answer. Always write a short summary of what the user needs when calling this tool, so the handoff has context.

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

async function toolEscalateToHuman(env, { summary, userEmail }) {
  const toEmail = env.SUPPORT_TO_EMAIL || "support@linkfinderai.com";
  const fromEmail = env.SUPPORT_FROM_EMAIL || "support-bot@linkfinderai.com";

  let emailSent = false;
  if (env.RESEND_API_KEY) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: toEmail,
          subject: `AI support escalation${userEmail ? " — " + userEmail : ""}`,
          text: `A visitor's conversation with the AI support widget was escalated.\n\nUser email (if given): ${userEmail || "not provided"}\n\nSummary:\n${summary}`,
        }),
      });
      emailSent = res.ok;
    } catch (err) {
      emailSent = false;
    }
  }

  return {
    escalated: true,
    email_sent_automatically: emailSent,
    card: {
      type: "escalate_card",
      heading: "Let's get you a real answer",
      body: summary,
      mailto: `mailto:${toEmail}?subject=${encodeURIComponent("Support request from AI chat")}&body=${encodeURIComponent(summary)}`,
      calendly: "https://calendly.com/hamoureliasse/intro-call",
    },
  };
}

const TOOLS = [
  {
    name: "fetch_page",
    description: "Fetch and return the plain-text content of a linkfinderai.com page. Use for exact current pricing/API/guide details not already known from the system prompt.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Site-relative path starting with /, e.g. /pricing.html or /resources/find-linkedin-url.html" },
      },
      required: ["path"],
    },
  },
  {
    name: "escalate_to_human",
    description: "Hand the conversation off to a human (Eliasse) instead of guessing. Returns a card the widget shows with a pre-filled email and a call-booking link.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Short summary of what the user needs help with, for the handoff." },
        userEmail: { type: "string", description: "The user's email if they gave it in the conversation, otherwise omit." },
      },
      required: ["summary"],
    },
  },
];

async function callAnthropic(env, messages) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
      tools: TOOLS,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }
  return res.json();
}

function textFromContent(content) {
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
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
  // Trim to a reasonable window so context/cost don't grow unbounded.
  const messages = history.slice(-20).map((m) => ({ role: m.role, content: m.content }));

  let escalateCard = null;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const result = await callAnthropic(env, messages);

    if (result.stop_reason !== "tool_use") {
      return new Response(
        JSON.stringify({ reply: textFromContent(result.content), escalate: escalateCard }),
        { headers: { "content-type": "application/json" } }
      );
    }

    // Assistant turn (may include text + tool_use blocks) goes back into history.
    messages.push({ role: "assistant", content: result.content });

    const toolResults = [];
    for (const block of result.content) {
      if (block.type !== "tool_use") continue;
      let output;
      if (block.name === "fetch_page") {
        output = await toolFetchPage(block.input.path);
      } else if (block.name === "escalate_to_human") {
        output = await toolEscalateToHuman(env, block.input);
        escalateCard = output.card;
      } else {
        output = { error: `unknown tool ${block.name}` };
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(output),
      });
    }
    messages.push({ role: "user", content: toolResults });
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

    if (!env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "Worker misconfigured: ANTHROPIC_API_KEY secret not set." }), {
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
