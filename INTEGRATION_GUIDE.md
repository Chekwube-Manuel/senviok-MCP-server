# Senviok Partner Integration Guide

This guide details how AI startups, SaaS platforms, and enterprise applications integrate Senviok communications infrastructure using standard OAuth 2.0 and the remote Model Context Protocol (MCP) server.

---

## 1. Overview

Senviok provides a unified API and Model Context Protocol (MCP) server for transactional and marketing communications across Email, SMS, and WhatsApp.

Integrating Senviok gives your AI agents and application workflows the ability to:
- Dispatch emails, SMS, and WhatsApp messages programmatically or via natural language.
- Inspect real-time delivery logs, open rates, click tracking, and bounce diagnostics.
- Manage recipient audiences, suppression lists, email templates, and sending domains.

Integration consists of two decoupled steps:
1. **OAuth 2.0 Authentication**: Users link their Senviok account with one click.
2. **MCP Tool Execution**: Your platform connects to Senviok's hosted Remote MCP server over Server-Sent Events (SSE).

---

## 2. OAuth 2.0 Authorization Flow

Senviok implements RFC 6749 Authorization Code Flow with RFC 7636 PKCE (Proof Key for Code Exchange) support.

### Endpoints

| Environment | Purpose | URL |
| :--- | :--- | :--- |
| **Web** | Authorization / Consent Screen | `https://senviok.live/oauth/authorize` |
| **API** | Token Exchange | `https://api.senviok.live/v1/oauth/token` |
| **API** | Client Metadata Verification | `https://api.senviok.live/v1/oauth/client-info` |

---

### Step 1: Initiate Authorization

Redirect the user's browser to the Senviok authorization endpoint:

```text
GET https://senviok.live/oauth/authorize
  ?client_id=YOUR_CLIENT_ID
  &redirect_uri=https://your-platform.com/api/integrations/senviok/callback
  &response_type=code
  &scope=email,sms,whatsapp,domains,templates,read
  &state=CSRF_PROTECTION_STRING
  &code_challenge=OPTIONAL_PKCE_CHALLENGE
  &code_challenge_method=S256
```

#### Parameters

- `client_id` (string, required): Issued by Senviok for your application.
- `redirect_uri` (string, required): One of your pre-registered callback URLs.
- `response_type` (string, required): Must be `code`.
- `scope` (string, optional): Comma-delimited list of permissions requested.
- `state` (string, required): Cryptographic random string to prevent CSRF attacks.
- `code_challenge` (string, optional): Base64URL-encoded SHA-256 hash of the PKCE verifier.
- `code_challenge_method` (string, optional): `S256` or `plain`.

---

### Step 2: Handle Callback

When the user approves access, Senviok redirects back to your registered `redirect_uri`:

```text
GET https://your-platform.com/api/integrations/senviok/callback
  ?code=snk_code_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
  &state=CSRF_PROTECTION_STRING
```

If the user denies access or an error occurs:
```text
GET https://your-platform.com/api/integrations/senviok/callback
  ?error=access_denied
  &error_description=The+user+denied+access
  &state=CSRF_PROTECTION_STRING
```

---

### Step 3: Exchange Code for Access Token

From your backend server, make an HTTP POST request to exchange the single-use code for an access token:

```http
POST https://api.senviok.live/v1/oauth/token HTTP/1.1
Host: api.senviok.live
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=snk_code_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
&redirect_uri=https://your-platform.com/api/integrations/senviok/callback
&client_id=YOUR_CLIENT_ID
&client_secret=YOUR_CLIENT_SECRET
&code_verifier=OPTIONAL_PKCE_VERIFIER
```

#### Response (`200 OK`)

```json
{
  "access_token": "svk_live_xxxxxxxxxxxxxxxxxxxxxxxx",
  "token_type": "Bearer",
  "expires_in": 2592000,
  "scope": "email,sms,whatsapp,domains,templates,read",
  "tenant_id": "ten_xxxxxxxxxxxx"
}
```

Persist the `access_token` securely in your database associated with the authorized user or tenant profile.

---

## 3. Remote MCP Server Integration

Senviok hosts a managed remote Model Context Protocol (MCP) server over Server-Sent Events (SSE) at:

```text
https://mcp.senviok.live/sse
```

Because the MCP server dynamically provides tool definitions upon connection, your platform does not require local CLI tools or npm package installations. When Senviok adds new tools, your AI agents automatically discover and support them on their next session.

---

### Implementation (TypeScript / Node.js)

Install the official client SDK:
```bash
npm install @modelcontextprotocol/sdk
```

Connect and discover available tools:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

export async function createSenviokClient(userAccessToken: string) {
  const transport = new SSEClientTransport(
    new URL("https://mcp.senviok.live/sse"),
    {
      eventSourceInit: {
        headers: {
          Authorization: `Bearer ${userAccessToken}`,
        },
      },
      requestInit: {
        headers: {
          Authorization: `Bearer ${userAccessToken}`,
        },
      },
    }
  );

  const client = new Client(
    { name: "partner-ai-client", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);

  // Discover all available tools dynamically
  const { tools } = await client.listTools();

  return { client, tools };
}
```

---

### Implementation (Python)

Install the official Python SDK:
```bash
pip install mcp httpx
```

Connect and call tools:

```python
from mcp import ClientSession
from mcp.client.sse import sse_client

async def run_senviok_agent(user_token: str):
    headers = {"Authorization": f"Bearer {user_token}"}
    
    async with sse_client("https://mcp.senviok.live/sse", headers=headers) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            
            # List available tools
            tools = await session.list_tools()
            
            # Execute a tool
            result = await session.call_tool(
                "senviok_send_email",
                arguments={
                    "to": "recipient@example.com",
                    "subject": "System Notification",
                    "html": "<p>Your requested process has completed.</p>"
                }
            )
            return result
```

---

## 4. Tool Catalog Reference

The Senviok MCP server exposes 18 production tools organized across 8 functional modules:

| Module | Tool | Description |
| :--- | :--- | :--- |
| **Email** | `senviok_send_email` | Send transactional or marketing emails (HTML, text, templates, CC, BCC, reply-to). |
| | `senviok_get_email_logs` | Search delivery logs, bounce reasons, open tracking, and link clicks. |
| **SMS** | `senviok_send_sms` | Send SMS text messages via approved international and Nigerian Sender IDs. |
| **WhatsApp** | `senviok_send_whatsapp` | Dispatch WhatsApp messages via session text or pre-approved templates. |
| **Templates** | `senviok_list_templates` | Retrieve all responsive email templates stored in the account library. |
| | `senviok_get_template` | Fetch full template content, HTML markup, and variable definitions. |
| | `senviok_create_template` | Create and save a new responsive HTML email template. |
| **Audiences** | `senviok_list_audiences` | List audience contact segments and subscriber groups. |
| | `senviok_create_audience` | Create a new audience list for campaigns or automated customer sync. |
| | `senviok_add_contact` | Enroll a contact with email, first name, and last name into an audience. |
| **Deliverability** | `senviok_list_suppressions` | View all suppressed, bounced, and unsubscribed email addresses. |
| | `senviok_add_suppression` | Manually suppress an email address to protect sender reputation. |
| | `senviok_remove_suppression` | Remove an email from suppression to restore message delivery. |
| **Domains** | `senviok_list_domains` | View registered sending domains and SPF, DKIM, and DMARC verification status. |
| | `senviok_create_domain` | Register a new sending domain in Senviok. |
| | `senviok_verify_domain` | Trigger live DNS check to verify SPF and DKIM record propagation. |
| | `senviok_get_domain_dns_records` | Retrieve exact DNS TXT and CNAME values required for domain setup. |
| **Webhooks** | `senviok_list_webhooks` | View registered webhook endpoints and subscribed delivery events. |
| | `senviok_create_webhook` | Register a new webhook endpoint URL for delivery, open, and bounce events. |
| **Account** | `senviok_get_account_balance` | Query current plan tier, remaining email and SMS credits, and usage stats. |

---

## 5. Security and Best Practices

1. **Token Storage**: Treat `access_token` values as credentials. Store them encrypted at rest using AES-256 or a secrets manager.
2. **State Verification**: Always validate the `state` parameter returned in the OAuth callback against the value stored in the user's initial session to protect against CSRF attacks.
3. **PKCE Enforcement**: Use PKCE (`code_challenge` / `code_verifier`) for all public clients (Single-Page Apps, mobile apps) to mitigate code interception risks.
4. **Transport Security**: All production endpoints enforce HTTPS with TLS 1.2+. Unencrypted HTTP connections are rejected.
5. **Rate Limiting**: Senviok API endpoints enforce standard rate limits per tenant. Handle HTTP 429 responses using exponential backoff with jitter.
