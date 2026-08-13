#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { randomUUID } from "node:crypto";
import { createServer } from "./server.js";

async function runStdio(): Promise<void> {
  const apiKey = process.env.LINKFINDER_API_KEY;
  if (!apiKey) {
    console.error(
      "LINKFINDER_API_KEY is not set. Get a key at https://linkfinderai.com and set it as an environment variable for this MCP server.",
    );
    process.exit(1);
  }

  const server = createServer(apiKey);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("LinkFinder AI MCP server running on stdio");
}

/**
 * Resolves the LinkFinder AI API key for one HTTP connection. Each client
 * is expected to send its own key as a bearer token, so a single hosted
 * deployment can serve many LinkFinder AI customers, each billed against
 * their own account. LINKFINDER_API_KEY (if set on the server) is only a
 * fallback for single-tenant self-hosted deployments.
 */
function resolveApiKeyFromRequest(req: express.Request): string | undefined {
  const authHeader = req.header("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  return process.env.LINKFINDER_API_KEY;
}

async function runHttp(): Promise<void> {
  const app = express();
  app.use(express.json());

  const port = Number(process.env.PORT) || 3000;

  app.post("/mcp", async (req, res) => {
    const apiKey = resolveApiKeyFromRequest(req);
    if (!apiKey) {
      res.status(401).json({
        error:
          'Missing LinkFinder AI API key. Pass it as "Authorization: Bearer <your LinkFinder AI API key>" when connecting this MCP server.',
      });
      return;
    }

    // Stateless: a fresh server + transport per request avoids cross-request
    // session bleed and keeps this easy to run behind a load balancer.
    const server = createServer(apiKey);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get("/mcp", (_req, res) => {
    res.status(405).json({ error: "Method not allowed. Use POST for MCP requests." });
  });

  app.listen(port, () => {
    console.error(`LinkFinder AI MCP server listening on http://localhost:${port}/mcp`);
  });
}

const transportMode = process.env.MCP_TRANSPORT?.toLowerCase() || (process.argv.includes("--http") ? "http" : "stdio");

if (transportMode === "http") {
  runHttp().catch((err) => {
    console.error("Failed to start LinkFinder AI MCP server (http):", err);
    process.exit(1);
  });
} else {
  runStdio().catch((err) => {
    console.error("Failed to start LinkFinder AI MCP server (stdio):", err);
    process.exit(1);
  });
}
