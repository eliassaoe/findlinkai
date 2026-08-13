import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { callLinkFinder, pollJob, type EnrichmentResult, type EnrichmentType } from "./client.js";

function toToolResult(result: EnrichmentResult) {
  if (result.status === "error") {
    return {
      isError: true,
      content: [{ type: "text" as const, text: result.message || "LinkFinder AI request failed." }],
    };
  }

  if (result.status === "processing") {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              status: "processing",
              job_id: result.jobId,
              poll_url: result.pollUrl,
              message: result.message,
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ status: "success", result: result.result }, null, 2),
      },
    ],
  };
}

const SERVER_INSTRUCTIONS = `LinkFinder AI turns a name, email, company, or LinkedIn URL into contact
and company data. Every tool below takes exactly ONE kind of input and returns
ONE kind of output — when a task needs an input you don't have yet, chain
tools together to produce it first.

COMMON WORKFLOWS

- "Look up / scrape a person by name" (e.g. "find info on Bill Gates at
  Microsoft", "scrape this person's LinkedIn"):
    1. find_linkedin_url_from_name (full_name + company) -> LinkedIn profile URL
    2. get_linkedin_profile_info (that URL) -> full profile (always async —
       this tool auto-polls; use check_job_status if it's still processing)
  Need their email or phone instead of/as well as the full profile? Skip
  step 2 and call find_email_from_linkedin_profile or
  find_phone_from_linkedin_profile on the URL from step 1 instead.

- "Find someone's LinkedIn from their email": find_linkedin_url_from_email
  directly — no chaining needed.

- "Research a company" from its name alone (e.g. "Tesla"):
  find_company_website, find_company_phone, find_company_email,
  find_company_employee_count, and find_company_linkedin_url all accept a
  bare company name directly — no chaining needed for any of them.

- "List employees at a company": find_company_employees needs a DOMAIN
  (e.g. "tesla.com"), not a name — call find_company_website first if you
  only have the company name, then feed its result in. Alternatively, if
  you already have (or found via find_company_linkedin_url) the company's
  LinkedIn page URL, find_linkedin_company_employees works directly from
  that instead.

- "Research a company via its LinkedIn page": get_linkedin_company_info,
  find_linkedin_company_employee_count, and find_linkedin_company_employees
  all take a LinkedIn COMPANY page URL. If you only have the company name,
  call find_company_linkedin_url first to get that URL.

- "Find leads matching a description" (e.g. "VP Sales at B2B SaaS startups
  in the US"): find_leads_ai directly — it already returns full profiles
  (name, email, LinkedIn URL, company details), so no further lookups are
  usually needed per lead.

- "Who reacted to this LinkedIn post": find_linkedin_post_reactions
  directly, from the post URL.

- Nothing above fits? b2b_data_lookup is a general-purpose fallback for
  company/person identifiers that don't clearly match a specific tool —
  prefer the specific tools whenever you know the input type, they're
  more reliable.

COSTS & ASYNC BEHAVIOR

Every call costs LinkFinder AI credits even when no data is found, except:
find_company_employees (1 credit per employee returned), find_leads_ai
(1 credit per lead returned), and find_linkedin_post_reactions (1 credit
per reaction returned) — all other tools are a flat 1 credit per call.

get_linkedin_profile_info always runs asynchronously; find_company_employees
occasionally does under heavy load. Both cases are handled transparently:
the tool auto-polls for up to ~55 seconds and only returns a bare job_id
(instead of the final result) if it's still processing after that — pass
that job_id to check_job_status to keep polling (results expire 10 minutes
after the original request).`;

/**
 * Builds an MCP server bound to a single resolved LinkFinder AI API key.
 * Callers are responsible for resolving that key per connection (env var
 * for a local single-user process, an incoming Authorization header or
 * URL path segment for a shared multi-tenant HTTP deployment) — see
 * index.ts.
 */
export function createServer(apiKey: string): McpServer {
  const server = new McpServer(
    {
      name: "linkfinderai-mcp-server",
      version: "1.0.0",
      title: "LinkFinder AI",
    },
    {
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  async function runLookup(type: EnrichmentType, inputData: string, extraFields?: Record<string, unknown>) {
    const result = await callLinkFinder(apiKey, type, inputData, extraFields);
    return toToolResult(result);
  }

  // ── Company enrichment (input: company name) ──────────────────────────

  server.registerTool(
    "find_company_website",
    {
      title: "Find company website",
      description:
        'Find a company\'s official website from its name (e.g. "Tesla" -> tesla.com). Costs 1 credit.',
      inputSchema: {
        company_name: z.string().min(1).describe('The company name to look up, e.g. "Tesla".'),
      },
    },
    async ({ company_name }) => runLookup("company_name_to_website", company_name),
  );

  server.registerTool(
    "find_company_phone",
    {
      title: "Find company phone number",
      description: "Find a company's contact phone number from its name. Costs 1 credit.",
      inputSchema: {
        company_name: z.string().min(1).describe('The company name to look up, e.g. "Tesla".'),
      },
    },
    async ({ company_name }) => runLookup("company_name_to_phone", company_name),
  );

  server.registerTool(
    "find_company_email",
    {
      title: "Find company email",
      description: "Find a company's contact email address from its name. Costs 1 credit.",
      inputSchema: {
        company_name: z.string().min(1).describe('The company name to look up, e.g. "Tesla".'),
      },
    },
    async ({ company_name }) => runLookup("company_name_to_email", company_name),
  );

  server.registerTool(
    "find_company_employee_count",
    {
      title: "Find company employee count",
      description:
        "Get a company's total employee count from its name. Costs 1 credit. For an actual list of employees (names, titles, LinkedIn URLs), use find_company_employees instead — that one needs the company's domain, not its name; call find_company_website first if you only have the name.",
      inputSchema: {
        company_name: z.string().min(1).describe('The company name to look up, e.g. "Tesla".'),
      },
    },
    async ({ company_name }) => runLookup("company_name_to_employee_count", company_name),
  );

  server.registerTool(
    "find_company_linkedin_url",
    {
      title: "Find company LinkedIn URL",
      description:
        "Find a company's LinkedIn page URL from its name. Costs 1 credit. Feed the result into get_linkedin_company_info, find_linkedin_company_employee_count, or find_linkedin_company_employees to look up more from that LinkedIn company page.",
      inputSchema: {
        company_name: z.string().min(1).describe('The company name to look up, e.g. "Tesla".'),
      },
    },
    async ({ company_name }) => runLookup("company_name_to_linkedin_url", company_name),
  );

  server.registerTool(
    "find_company_employees",
    {
      title: "Find company employees (by domain)",
      description:
        'Get a list of employees (name, job title, LinkedIn URL, location) at a company from its DOMAIN, e.g. "tesla.com" — not the company name; call find_company_website first if you only have the name. Optionally filter by department/seniority and cap the number of results. Costs 1 credit per employee returned. May respond asynchronously under load; this tool auto-polls for up to ~55s before falling back to a job_id you can poll with check_job_status.',
      inputSchema: {
        company_domain: z.string().min(1).describe('The company domain to look up, e.g. "tesla.com".'),
        department: z.string().optional().describe('Optional department filter, e.g. "marketing", "engineering".'),
        seniority: z.string().optional().describe('Optional seniority filter, e.g. "director", "manager".'),
        employee_count: z.number().int().min(1).optional().describe("Optional cap on the number of employees returned."),
      },
    },
    async ({ company_domain, department, seniority, employee_count }) =>
      runLookup("company_domain_to_employees", company_domain, { department, seniority, employee_count }),
  );

  // ── LinkedIn profile lookups (input: LinkedIn person profile URL) ─────

  server.registerTool(
    "get_linkedin_profile_info",
    {
      title: "Get LinkedIn profile info",
      description:
        "Look up full profile details (job history, education, headline, etc.) for a person from their LinkedIn profile URL — the main tool for \"scrape/look up this person's LinkedIn\". If you only have a name and company, not a URL, call find_linkedin_url_from_name first. This operation always processes asynchronously — this tool auto-polls for up to ~55s and, if it's not done yet, returns a job_id you can poll with check_job_status. Costs 1 credit.",
      inputSchema: {
        linkedin_url: z.string().min(1).describe('The LinkedIn profile URL, e.g. "https://www.linkedin.com/in/someone".'),
      },
    },
    async ({ linkedin_url }) => runLookup("linkedin_profile_to_linkedin_info", linkedin_url),
  );

  server.registerTool(
    "find_email_from_linkedin_profile",
    {
      title: "Find email from LinkedIn profile",
      description:
        "Find a person's professional email address from their LinkedIn profile URL. If you only have a name and company, not a URL, call find_linkedin_url_from_name first. Costs 1 credit.",
      inputSchema: {
        linkedin_url: z.string().min(1).describe('The LinkedIn profile URL, e.g. "https://www.linkedin.com/in/someone".'),
      },
    },
    async ({ linkedin_url }) => runLookup("linkedin_profile_to_email", linkedin_url),
  );

  server.registerTool(
    "find_phone_from_linkedin_profile",
    {
      title: "Find phone number from LinkedIn profile",
      description:
        "Find a person's phone number from their LinkedIn profile URL. If you only have a name and company, not a URL, call find_linkedin_url_from_name first. Costs 1 credit.",
      inputSchema: {
        linkedin_url: z.string().min(1).describe('The LinkedIn profile URL, e.g. "https://www.linkedin.com/in/someone".'),
      },
    },
    async ({ linkedin_url }) => runLookup("linkedin_profile_to_phone", linkedin_url),
  );

  // ── LinkedIn company page lookups (input: LinkedIn company URL) ───────

  server.registerTool(
    "get_linkedin_company_info",
    {
      title: "Get LinkedIn company info",
      description:
        "Look up detailed company data (industry, employee count, follower count, founded year, description, etc.) from a LinkedIn COMPANY page URL. If you only have the company name, call find_company_linkedin_url first. Costs 1 credit.",
      inputSchema: {
        linkedin_company_url: z.string().min(1).describe('The LinkedIn company page URL, e.g. "https://www.linkedin.com/company/tesla-motors".'),
      },
    },
    async ({ linkedin_company_url }) => runLookup("linkedin_company_to_linkedin_info", linkedin_company_url),
  );

  server.registerTool(
    "find_linkedin_company_employee_count",
    {
      title: "Find LinkedIn company employee count",
      description:
        "Get employee count from a LinkedIn company page URL. If you only have the company name, call find_company_linkedin_url first. Costs 1 credit.",
      inputSchema: {
        linkedin_company_url: z.string().min(1).describe('The LinkedIn company page URL, e.g. "https://www.linkedin.com/company/tesla-motors".'),
      },
    },
    async ({ linkedin_company_url }) => runLookup("linkedin_company_to_employee_count", linkedin_company_url),
  );

  server.registerTool(
    "find_linkedin_company_employees",
    {
      title: "Find LinkedIn company employees",
      description:
        "Get a list of employees (name, job title, LinkedIn URL, location) at a company from its LinkedIn company page URL. If you only have the company name, call find_company_linkedin_url first. Costs 1 credit total regardless of list size.",
      inputSchema: {
        linkedin_company_url: z.string().min(1).describe('The LinkedIn company page URL, e.g. "https://www.linkedin.com/company/tesla-motors".'),
      },
    },
    async ({ linkedin_company_url }) => runLookup("linkedin_company_to_employees", linkedin_company_url),
  );

  // ── Reverse lookups to a LinkedIn profile URL ──────────────────────────

  server.registerTool(
    "find_linkedin_url_from_name",
    {
      title: "Find LinkedIn URL from name + company",
      description:
        'Find a person\'s LinkedIn profile URL from their full name and the company they work at — the key first step whenever you need to look someone up by name (e.g. "find Bill Gates\'s info at Microsoft") and don\'t already have their LinkedIn URL. Feed the result into get_linkedin_profile_info, find_email_from_linkedin_profile, or find_phone_from_linkedin_profile. Costs 1 credit.',
      inputSchema: {
        full_name: z.string().min(1).describe('The person\'s full name, e.g. "Bill Gates".'),
        company: z.string().min(1).describe('The company they work at, e.g. "Microsoft".'),
      },
    },
    async ({ full_name, company }) => runLookup("lead_full_name_to_linkedin_url", `${full_name} ${company}`),
  );

  server.registerTool(
    "find_linkedin_url_from_email",
    {
      title: "Find LinkedIn URL from email",
      description: "Reverse-lookup a person's LinkedIn profile URL from their professional email address. Costs 1 credit.",
      inputSchema: {
        email: z.string().min(1).describe('The professional email address, e.g. "john.doe@company.com".'),
      },
    },
    async ({ email }) => runLookup("email_to_linkedin_url", email),
  );

  // ── LinkedIn posts, AI lead search, fallback ───────────────────────────

  server.registerTool(
    "find_linkedin_post_reactions",
    {
      title: "Find LinkedIn post reactions",
      description: "Get a list of people who reacted to a LinkedIn post, from the post's URL. Costs 1 credit per reaction returned.",
      inputSchema: {
        linkedin_post_url: z.string().min(1).describe("The LinkedIn post URL."),
      },
    },
    async ({ linkedin_post_url }) => runLookup("linkedin_post_to_reactions", linkedin_post_url),
  );

  server.registerTool(
    "find_leads_ai",
    {
      title: "AI lead finder",
      description:
        'Natural-language B2B lead search, e.g. "VP Sales at B2B SaaS startups in the United States". Returns full profiles already (name, job title, email, LinkedIn URL, company details) — no further lookups usually needed per lead. Costs 1 credit per lead returned.',
      inputSchema: {
        query: z.string().min(1).describe('Natural-language description of the leads to find, e.g. "VP Sales at B2B SaaS startup in the United States".'),
        fetch_count: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(10)
          .describe("Number of matching leads to return (1-100, default 10)."),
      },
    },
    async ({ query, fetch_count }) => runLookup("leads_finder_ai", query, { fetch_count }),
  );

  server.registerTool(
    "b2b_data_lookup",
    {
      title: "General B2B data lookup (fallback)",
      description:
        "General-purpose fallback lookup for company or person identifiers (name, domain, email, ...) that don't clearly match one of the more specific tools above. Prefer the specific tools whenever you know the input type — they're more reliable. Costs 1 credit.",
      inputSchema: {
        input_data: z.string().min(1).describe("The identifier to look up, e.g. a company name, domain, or email address."),
      },
    },
    async ({ input_data }) => runLookup("b2b_data_lookup", input_data),
  );

  server.registerTool(
    "check_job_status",
    {
      title: "Check async job status",
      description:
        'Poll the status/result of an async LinkFinder AI job by job_id (returned when a tool reports status "processing"). Job results expire 10 minutes after the original request.',
      inputSchema: {
        job_id: z.string().min(1).describe("The job_id returned by a previous LinkFinder AI tool call."),
      },
    },
    async ({ job_id }) => toToolResult(await pollJob(apiKey, job_id)),
  );

  return server;
}
