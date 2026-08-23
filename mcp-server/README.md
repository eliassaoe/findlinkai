[README (4).md](https://github.com/user-attachments/files/31047807/README.4.md)
# LinkFinder AI MCP Server

An [MCP](https://modelcontextprotocol.io) server that exposes the [LinkFinder AI](https://linkfinderai.com) API as tools, so you can call it directly from Claude, ChatGPT, or any other MCP-compatible client — no custom integration code needed.

## Tools

18 tools covering the LinkFinder AI operation set, grouped by what input
they need (Instagram lookup omitted for now):

| Tool | Input → Output |
|---|---|
| `find_company_website` | Company name → website/domain |
| `find_company_phone` | Company name → phone number |
| `find_company_email` | Company name → email address |
| `find_company_employee_count` | Company name → employee count |
| `find_company_linkedin_url` | Company name → LinkedIn company page URL |
| `find_company_employees` | Company **domain** → list of employees |
| `get_linkedin_profile_info` | LinkedIn profile URL → full profile (always async) |
| `find_email_from_linkedin_profile` | LinkedIn profile URL → email |
| `find_phone_from_linkedin_profile` | LinkedIn profile URL → phone |
| `get_linkedin_company_info` | LinkedIn company URL → company details |
| `find_linkedin_company_employee_count` | LinkedIn company URL → employee count |
| `find_linkedin_company_employees` | LinkedIn company URL → list of employees |
| `find_linkedin_url_from_name` | Full name + company → LinkedIn profile URL |
| `find_linkedin_url_from_email` | Email → LinkedIn profile URL |
| `find_linkedin_post_reactions` | LinkedIn post URL → list of people who reacted |
| `b2b_data_lookup` | General fallback lookup (name, domain, email, ...) |
| `check_job_status` | Poll a job that's still processing |

**Chaining:** most tools take exactly one kind of input. When a task needs
an input you don't have yet — e.g. "look up Bill Gates at Microsoft" needs
a LinkedIn URL, which `get_linkedin_profile_info` requires — the calling AI
is expected to chain tools together (`find_linkedin_url_from_name` first,
then feed its result into `get_linkedin_profile_info`). The server ships
this chaining knowledge two ways so it works with any MCP client: a
detailed `instructions` string returned at `initialize` (walking through
every common workflow), and cross-references inside each individual tool's
own `description` (e.g. "*if you only have a name, call
find_linkedin_url_from_name first*") for clients that don't surface
server-level instructions.

LinkFinder AI's API dispatches everything through a single endpoint and, for
a couple of operations, responds asynchronously with a `job_id`. This server
handles that for you: each lookup tool auto-polls for up to ~55 seconds and
only returns a `job_id` (for use with `check_job_status`) if the job is still
running after that.

Every request costs 1 LinkFinder AI credit, including empty results, except
`find_company_employees` and `find_linkedin_post_reactions`
(1 credit per item returned) — billed by LinkFinder AI itself, not by this
server.

## Setup

You need a LinkFinder AI API key from https://linkfinderai.com.

```bash
cd mcp-server
npm install
npm run build
```

This produces `dist/index.js`, a standalone MCP server runnable with `node`.

## Using it from Claude Desktop / Claude Code

Add it to your MCP config (Claude Desktop: `claude_desktop_config.json`; Claude Code: `claude mcp add`):

```json
{
  "mcpServers": {
    "linkfinderai": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"],
      "env": {
        "LINKFINDER_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

Or with Claude Code's CLI:

```bash
claude mcp add linkfinderai --env LINKFINDER_API_KEY=your_api_key_here -- node /absolute/path/to/mcp-server/dist/index.js
```

## Using it from ChatGPT, Cowork, or other clients that need a remote (HTTP) server

ChatGPT, Cowork, and other Apps SDK / Agents SDK clients connect to MCP
servers over HTTP rather than launching a local process. Run this server in
HTTP mode:

```bash
MCP_TRANSPORT=http PORT=3000 npm start
```

This serves the MCP endpoint at `POST http://localhost:3000/mcp` (Streamable
HTTP transport). Deploy it somewhere reachable over HTTPS (Render, Railway,
Fly.io, a VPS, etc.) and point your client's MCP/connector settings at
`https://your-host/mcp`. For local testing against clients that only speak
stdio, you can bridge a remote HTTP MCP server with
[`mcp-remote`](https://www.npmjs.com/package/mcp-remote).

**Multi-tenant by design:** in HTTP mode, each client sends its own
LinkFinder AI API key when it connects — the server does not read
`LINKFINDER_API_KEY` from its own environment for these requests (that env
var is only a fallback for a single-tenant self-hosted instance, see below).
This means one shared deployment can serve any number of LinkFinder AI
customers, each one billed against their own account, with no shared
credentials baked into the server. Two ways to supply the key, checked in
this order:

1. **`Authorization: Bearer <key>` header** — for clients that let you
   configure custom headers.
2. **The key embedded in the URL path**, as `POST /mcp/<key>` instead of
   `POST /mcp` — for clients that only let you configure a URL (e.g.
   Claude's custom connector UI, which offers a URL field and optional
   OAuth, but no generic header/API-key field). Example:
   `https://your-host/mcp/sk_your_linkfinder_key_here`.

If no `Authorization` header is present on a request, the server falls back
to a server-side `LINKFINDER_API_KEY` env var if one is set — useful if
you're self-hosting a single-tenant instance just for yourself. If neither
is present, the server responds `401` before doing anything else.

## Configuration

| Env var | Required | Default | Purpose |
|---|---|---|---|
| `LINKFINDER_API_KEY` | stdio: yes. http: no (fallback only) | — | Your LinkFinder AI API key. In stdio mode this is the only source of the key. In HTTP mode it's only used when a request has no `Authorization` header. |
| `LINKFINDER_API_BASE_URL` | no | `https://api.linkfinderai.com` | Override the API base URL |
| `MCP_TRANSPORT` | no | `stdio` | Set to `http` to run the Streamable HTTP server instead |
| `PORT` | no | `3000` | Port for HTTP mode |

See `.env.example`.

## Development

```bash
npm run dev    # tsc --watch
npm run build  # one-off compile to dist/
```
