# LinkFinder AI MCP Server

An [MCP](https://modelcontextprotocol.io) server that exposes the [LinkFinder AI](https://linkfinderai.com) API as tools, so you can call it directly from Claude, ChatGPT, or any other MCP-compatible client — no custom integration code needed.

## Tools

| Tool | What it does |
|---|---|
| `find_company_website` | Company name → website/domain |
| `find_company_employees` | Company domain → employee list |
| `get_linkedin_profile_info` | LinkedIn profile URL → profile data |
| `b2b_data_lookup` | General B2B lookup (name, domain, email, ...) |
| `instagram_lookup` | Instagram username/URL → profile data |
| `find_leads_ai` | Natural-language lead search (e.g. "VP Sales at B2B SaaS startups in the US") |
| `check_job_status` | Poll a job that's still processing |

LinkFinder AI's API dispatches everything through a single endpoint and, for a
couple of operations, responds asynchronously with a `job_id`. This server
handles that for you: each lookup tool auto-polls for up to ~55 seconds and
only returns a `job_id` (for use with `check_job_status`) if the job is still
running after that.

Every request costs 1 LinkFinder AI credit, including empty results — that's
billed by LinkFinder AI itself, not by this server.

## Setup

You need a LinkFinder AI API key from https://linkfinderai.com.

```bash
cd mcp-server
npm install
npm run build
