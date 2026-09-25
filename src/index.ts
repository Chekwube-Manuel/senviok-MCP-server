import express, { Request, Response } from "express";
import cors from "cors";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { config } from "./config.js";
import { createSenviokMcpServer } from "./mcp/server.js";

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());

// Track active client SSE transports by sessionId
const transports = new Map<string, SSEServerTransport>();

// Helper to extract API key from headers or query parameters
function extractApiKey(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7).trim();
  }

  const customHeader = req.headers["x-api-key"];
  if (typeof customHeader === "string" && customHeader.trim()) {
    return customHeader.trim();
  }

  const queryKey = req.query.api_key;
  if (typeof queryKey === "string" && queryKey.trim()) {
    return queryKey.trim();
  }

  return undefined;
}

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "senviok-remote-mcp",
    version: "1.1.0",
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Root informational endpoint
app.get("/", (req: Request, res: Response) => {
  res.json({
    name: "Senviok Remote MCP Server",
    description: "Cloud-hosted Model Context Protocol (MCP) server for Senviok email, SMS, WhatsApp, and delivery diagnostics.",
    version: "1.1.0",
    endpoints: {
      sse: "/sse",
      messages: "/messages",
      health: "/health",
    },
    documentation: "https://docs.senviok.live",
    tools: [
      // Email
      "senviok_send_email",
      "senviok_get_email_logs",
      // SMS & WhatsApp
      "senviok_send_sms",
      "senviok_send_whatsapp",
      // Templates
      "senviok_list_templates",
      "senviok_get_template",
      "senviok_create_template",
      // Audiences & Contacts
      "senviok_list_audiences",
      "senviok_create_audience",
      "senviok_add_contact",
      // Suppressions & Deliverability
      "senviok_list_suppressions",
      "senviok_add_suppression",
      "senviok_remove_suppression",
      // Domains
      "senviok_list_domains",
      "senviok_create_domain",
      "senviok_verify_domain",
      "senviok_get_domain_dns_records",
      // Webhooks
      "senviok_list_webhooks",
      "senviok_create_webhook",
      // Billing & Account
      "senviok_get_account_balance",
    ],
  });
});

/**
 * GET /sse
 * Main entry point for MCP clients connecting over Server-Sent Events (SSE).
 */
app.get("/sse", async (req: Request, res: Response) => {
  const apiKey = extractApiKey(req);
  console.log(`[SSE] New client connection from ${req.ip} ${apiKey ? "(authenticated)" : "(unauthenticated)"}`);

  try {
    const transport = new SSEServerTransport("/messages", res);
    const mcpServer = createSenviokMcpServer(apiKey);

    transports.set(transport.sessionId, transport);

    req.on("close", () => {
      console.log(`[SSE] Client connection closed (sessionId: ${transport.sessionId})`);
      transports.delete(transport.sessionId);
    });

    await mcpServer.connect(transport);
  } catch (err: any) {
    console.error("[SSE] Error establishing SSE connection:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to establish SSE transport", details: err.message });
    }
  }
});

/**
 * POST /messages
 * Processes incoming JSON-RPC commands from the MCP client.
 */
app.post("/messages", async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;

  if (!sessionId) {
    res.status(400).json({ error: "Missing sessionId query parameter" });
    return;
  }

  const transport = transports.get(sessionId);
  if (!transport) {
    res.status(404).json({ error: `Session '${sessionId}' not found or has expired` });
    return;
  }

  try {
    await transport.handlePostMessage(req, res);
  } catch (err: any) {
    console.error(`[Messages] Error handling post message for session ${sessionId}:`, err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to process message", details: err.message });
    }
  }
});

app.listen(config.port, () => {
  console.log(`==================================================`);
  console.log(`  🚀 Senviok Remote MCP Server v1.1.0 is running!`);
  console.log(`  📡 Listening on:   http://localhost:${config.port}`);
  console.log(`  🔗 SSE Endpoint:   http://localhost:${config.port}/sse`);
  console.log(`  🔗 Base API:       ${config.senviokBaseUrl}`);
  console.log(`==================================================`);
});
