import express, { Request, Response } from "express";
import cors from "cors";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { config } from "./config.js";
import { createSenviokMcpServer } from "./mcp/server.js";

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());

// Vercel invokes the exported Express app as a function. Local Docker/Node uses
// app.listen below. Streamable HTTP is stateless so requests can land on any
// Vercel function instance without relying on this process's memory.
export default app;

// Track active client SSE transports by sessionId
const transports = new Map<string, SSEServerTransport>();
type SessionCredential = { token: string; principal: string };
const sessionCredentials = new Map<string, SessionCredential>();
const resourceUrl = process.env.MCP_RESOURCE_URL || "https://mcp.senviok.live/mcp";
const resourceMetadataUrl = process.env.MCP_RESOURCE_METADATA_URL || "https://mcp.senviok.live/.well-known/oauth-protected-resource/mcp";
const authorizationServer = process.env.SENVIOK_OAUTH_ISSUER || "https://api.senviok.live";
const oauthScopes = ["email:send", "email:read", "inbox:read", "inbox:reply", "templates:read", "templates:write", "audiences:read", "audiences:write", "campaigns:read", "campaigns:write", "sms:send", "whatsapp:send", "suppressions:read", "suppressions:write", "domains:read", "domains:write", "webhooks:read", "webhooks:write", "account:read", "offline_access"];

app.get("/.well-known/oauth-protected-resource/mcp", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json({ resource: resourceUrl, authorization_servers: [authorizationServer], bearer_methods_supported: ["header"], scopes_supported: oauthScopes, resource_documentation: "https://senviok.live/docs#oauth" });
});

// Helper to extract API key from headers or query parameters
function extractApiKey(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const bearer = authHeader.match(/^Bearer\s+(.+)$/i);
    if (bearer?.[1]?.trim()) return bearer[1].trim();
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

async function validateBearerToken(token: string, res: Response): Promise<SessionCredential | undefined> {
  let principal = "";
  try {
    const check = await fetch(`${config.senviokBaseUrl}/oauth/mcp-context`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (check.status === 401 || check.status === 403) {
      res.setHeader("WWW-Authenticate", `Bearer error="invalid_token", resource_metadata="${resourceMetadataUrl}"`);
      res.status(401).json({ error: "invalid_token", error_description: "The Senviok access token is expired, revoked, or invalid." });
      return undefined;
    }
    if (!check.ok) {
      res.status(503).json({ error: "temporarily_unavailable", error_description: "Senviok could not validate this connection. Retry shortly." });
      return undefined;
    }
    const context = await check.json() as { oauth?: boolean; audience?: string | null; client_id?: string | null; subject?: string | null; tenant_id?: string | null };
    if (context.oauth && context.audience !== resourceUrl) {
      res.setHeader("WWW-Authenticate", `Bearer error="invalid_token", resource_metadata="${resourceMetadataUrl}"`);
      res.status(401).json({ error: "invalid_token", error_description: "This token was issued for a different resource. Reconnect Senviok." });
      return undefined;
    }
    principal = context.oauth
      ? `oauth:${context.client_id ?? ""}:${context.subject ?? ""}:${context.tenant_id ?? ""}`
      : `apikey:${context.subject ?? ""}:${context.tenant_id ?? ""}`;
  } catch {
    res.status(503).json({ error: "temporarily_unavailable", error_description: "Senviok could not validate this connection. Retry shortly." });
    return undefined;
  }
  return { token, principal };
}

async function requireBearer(req: Request, res: Response): Promise<SessionCredential | undefined> {
  const token = extractApiKey(req);
  if (!token) {
    res.setHeader("WWW-Authenticate", `Bearer resource_metadata="${resourceMetadataUrl}"`);
    res.status(401).json({ error: "unauthorized", error_description: "Connect this MCP server with Senviok OAuth." });
    return undefined;
  }
  return validateBearerToken(token, res);
}

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "senviok-remote-mcp",
    version: "1.1.2",
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Root informational endpoint
app.get("/", (req: Request, res: Response) => {
  res.json({
    name: "Senviok Remote MCP Server",
    description: "Cloud-hosted Model Context Protocol (MCP) server for Senviok email, SMS, WhatsApp, and delivery diagnostics.",
    version: "1.1.2",
    endpoints: {
      mcp: "/mcp",
      sse: "/sse",
      messages: "/messages",
      health: "/health",
    },
    documentation: "https://senviok.live/docs#oauth",
    tools: [
      // Email
      "senviok_send_email",
      "senviok_get_email_logs",
      "senviok_list_inbox",
      "senviok_get_inbox_message",
      "senviok_reply_to_inbox_message",
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
 * MCP Streamable HTTP endpoint (stateless and safe for Vercel's per-request
 * execution model). Construct a fresh server and transport for each request.
 */
app.all("/mcp", async (req: Request, res: Response) => {
  const token = extractApiKey(req);
  const publicMethods = new Set(["initialize", "notifications/initialized", "tools/list"]);
  const canDiscoverBeforeAuth = req.method === "POST" && publicMethods.has(req.body?.method);
  const credential = token
    ? await validateBearerToken(token, res)
    : canDiscoverBeforeAuth ? undefined : await requireBearer(req, res);
  if (res.headersSent) return;
  const apiKey = credential?.token;
  const mcpServer = createSenviokMcpServer(apiKey);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    void mcpServer.close().catch((err: unknown) => console.error("[MCP] Error closing request server:", err));
  };

  res.once("close", close);
  try {
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err: unknown) {
    console.error("[MCP] Streamable HTTP request failed:", err);
    if (!res.headersSent) res.status(500).json({ error: "MCP request failed" });
    close();
  }
});

/**
 * GET /sse
 * Main entry point for MCP clients connecting over Server-Sent Events (SSE).
 */
app.get("/sse", async (req: Request, res: Response) => {
  const credential = await requireBearer(req, res);
  if (!credential) return;
  console.log(`[SSE] New authenticated client connection from ${req.ip}`);

  try {
    const transport = new SSEServerTransport("/messages", res);
    const mcpServer = createSenviokMcpServer(() => sessionCredentials.get(transport.sessionId)?.token ?? credential.token);

    transports.set(transport.sessionId, transport);
    sessionCredentials.set(transport.sessionId, credential);

    res.once("close", () => {
      console.log(`[SSE] Client connection closed (sessionId: ${transport.sessionId})`);
      transports.delete(transport.sessionId);
      sessionCredentials.delete(transport.sessionId);
      void mcpServer.close().catch((err: unknown) => console.error("[SSE] Error closing MCP server:", err));
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

  const credential = await requireBearer(req, res);
  if (!credential) return;
  const sessionCredential = sessionCredentials.get(sessionId);
  if (sessionCredential?.principal !== credential.principal) {
    res.status(401).json({ error: "unauthorized", error_description: "This session belongs to a different OAuth connection." });
    return;
  }
  sessionCredentials.set(sessionId, credential);

  try {
    // express.json() has consumed the request stream; pass the parsed value so
    // the SDK does not try to read the body stream a second time.
    await transport.handlePostMessage(req, res, req.body);
  } catch (err: any) {
    console.error(`[Messages] Error handling post message for session ${sessionId}:`, err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to process message", details: err.message });
    }
  }
});

if (!process.env.VERCEL) {
  app.listen(config.port, () => {
    console.log("==================================================");
    console.log(`  Senviok Remote MCP Server v1.1.2 is running on port ${config.port}`);
    console.log(`  Streamable HTTP: http://localhost:${config.port}/mcp`);
    console.log(`  Legacy SSE:      http://localhost:${config.port}/sse`);
    console.log(`  Base API:        ${config.senviokBaseUrl}`);
    console.log("==================================================");
  });
}
