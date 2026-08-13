#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { randomUUID } from "node:crypto";
import { createServer } from "./server.js";

async function runStdio(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("LinkFinder AI MCP server running on stdio");
}

async function runHttp(): Promise<void> {
  const app = express();
  app.use(express.json());

  const port = Number(process.env.PORT) || 3000;

  app.post("/mcp", async (req, res) => {
    // Stateless: a fresh server + transport per request avoids cross-request
    // session bleed and keeps this easy to run behind a load balancer.
    const server = createServer();
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
