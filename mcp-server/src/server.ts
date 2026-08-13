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

/**
 * Builds an MCP server bound to a single resolved LinkFinder AI API key.
 * Callers are responsible for resolving that key per connection (env var
 * for a local single-user process, an incoming Authorization header for a
 * shared multi-tenant HTTP deployment) — see index.ts.
 */
export function createServer(apiKey: string): McpServer {
  const server = new McpServer({
    name: "linkfinderai-mcp-server",
    version: "1.0.0",
    title: "LinkFinder AI",
  });

  async function runLookup(type: EnrichmentType, inputData: string, fetchCount?: number) {
    const result = await callLinkFinder(apiKey, type, inputData, fetchCount);
    return toToolResult(result);
  }

  server.registerTool(
    "find_company_website",
    {
      title: "Find company website",
      description:
        "Look up a company's website/domain from its name (e.g. \"Tesla\" -> tesla.com). Costs 1 LinkFinder AI credit.",
      inputSchema: {
        company_name: z.string().min(1).describe("The company name to look up, e.g. \"Tesla\"."),
      },
    },
    async ({ company_name }) => runLookup("company_name_to_website", company_name),
  );

  server.registerTool(
    "find_company_employees",
    {
      title: "Find company employees",
      description:
        "Look up employees at a company from its domain (e.g. \"tesla.com\"). May respond asynchronously under load; this tool auto-polls for up to ~55s before falling back to a job_id you can poll with check_job_status. Costs 1 credit.",
      inputSchema: {
        company_domain: z.string().min(1).describe("The company domain to look up, e.g. \"tesla.com\"."),
      },
    },
    async ({ company_domain }) => runLookup("company_domain_to_employees", company_domain),
  );

  server.registerTool(
    "get_linkedin_profile_info",
    {
      title: "Get LinkedIn profile info",
      description:
        "Look up details for a LinkedIn profile URL. This operation always processes asynchronously — this tool auto-polls for up to ~55s and, if it's not done yet, returns a job_id you can poll with check_job_status. Costs 1 credit.",
      inputSchema: {
        linkedin_url: z.string().min(1).describe("The LinkedIn profile URL, e.g. \"https://www.linkedin.com/in/someone\"."),
      },
    },
    async ({ linkedin_url }) => runLookup("linkedin_profile_to_linkedin_info", linkedin_url),
  );

  server.registerTool(
    "b2b_data_lookup",
    {
      title: "B2B data lookup",
      description: "General-purpose B2B data lookup (company or person identifiers such as name, domain, or email). Costs 1 credit.",
      inputSchema: {
        input_data: z.string().min(1).describe("The identifier to look up, e.g. a company name, domain, or email address."),
      },
    },
    async ({ input_data }) => runLookup("b2b_data_lookup", input_data),
  );

  server.registerTool(
    "instagram_lookup",
    {
      title: "Instagram lookup",
      description: "Look up data for an Instagram profile (username or URL). Costs 1 credit.",
      inputSchema: {
        input_data: z.string().min(1).describe("An Instagram username or profile URL."),
      },
    },
    async ({ input_data }) => runLookup("instagram_lookup", input_data),
  );

  server.registerTool(
    "find_leads_ai",
    {
      title: "AI lead finder",
      description:
        "Natural-language B2B lead search, e.g. \"VP Sales at B2B SaaS startups in the United States\". Returns a list of matching leads. Costs 1 credit per request (not per lead).",
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
    async ({ query, fetch_count }) => runLookup("leads_finder_ai", query, fetch_count),
  );

  server.registerTool(
    "check_job_status",
    {
      title: "Check async job status",
      description:
        "Poll the status/result of an async LinkFinder AI job by job_id (returned when a lookup tool reports status \"processing\"). Job results expire 10 minutes after the original request.",
      inputSchema: {
        job_id: z.string().min(1).describe("The job_id returned by a previous LinkFinder AI tool call."),
      },
    },
    async ({ job_id }) => toToolResult(await pollJob(apiKey, job_id)),
  );

  return server;
}
