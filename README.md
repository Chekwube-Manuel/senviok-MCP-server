# Senviok Remote MCP Server

A cloud-hosted Model Context Protocol (MCP) server that exposes [Senviok's](https://senviok.live) communications infrastructure to AI agents and web platforms (such as Claude, ChatGPT, Cursor, and OkeyMeta).

Built with TypeScript and the official `@modelcontextprotocol/sdk`.

---

## Key Features

- **Zero Client Installs**: Runs as a remote HTTP/Server-Sent Events (SSE) service. Web AI platforms (e.g. OkeyMeta, ChatGPT Custom Actions) connect directly over HTTPS without end-users needing Node or CLI tools.
- **Instant Rollouts**: Add new tools to the server, and all connected AI agents immediately discover and use them on their next session without reinstalling or updating anything.
- **Multi-Tenant Authentication**: Clients supply their Senviok API key via `Authorization: Bearer <key>`, `x-api-key: <key>`, `?api_key=<key>`, or as a per-tool `apiKey` argument.

---

## Complete Tool Catalog (18 Tools)

### Email
- `senviok_send_email`: Send transactional or marketing emails with HTML, text, and dynamic templates.
- `senviok_get_email_logs`: Search delivery logs, check bounce reasons, and inspect open/click tracking.

### SMS and WhatsApp
- `senviok_send_sms`: Send SMS text messages via approved Sender IDs.
- `senviok_send_whatsapp`: Send WhatsApp messages directly or via pre-approved WhatsApp templates.

### Template Management
- `senviok_list_templates`: List all saved templates in your Senviok library.
- `senviok_get_template`: Fetch template details and HTML content.
- `senviok_create_template`: Create and save a new responsive HTML email template.

### Audiences and Contacts (CRM)
- `senviok_list_audiences`: List contact audiences and subscriber lists.
- `senviok_create_audience`: Create a new audience list for marketing campaigns.
- `senviok_add_contact`: Add a subscriber contact with first/last name to an audience.

### Deliverability and Suppressions
- `senviok_list_suppressions`: View all suppressed, bounced, or unsubscribed emails.
- `senviok_add_suppression`: Manually suppress an email address to protect sender reputation.
- `senviok_remove_suppression`: Unblock an email from the suppression list.

### Domains and DNS
- `senviok_list_domains`: View registered sending domains and SPF, DKIM, DMARC verification status.
- `senviok_create_domain`: Register a new sending domain in Senviok.
- `senviok_verify_domain`: Trigger live DNS check for SPF/DKIM propagation.
- `senviok_get_domain_dns_records`: Get exact DNS records (TXT/CNAME) for domain configuration.

### Webhooks
- `senviok_list_webhooks`: View registered webhooks and subscribed events.
- `senviok_create_webhook`: Register a new webhook endpoint URL.

### Billing and Account
- `senviok_get_account_balance`: Retrieve plan tier, remaining email/SMS credits, and usage stats.

---

## Quick Start (Local Development)

### 1. Install and Build
```bash
npm install
npm run build
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your settings
```

### 3. Run
```bash
# Development mode (hot reload)
npm run dev

# Production mode
npm start
```

The server will start at `http://localhost:3001`.

---

## Connecting from AI Platforms

### OkeyMeta / Remote AI Platforms
Connect to the live SSE endpoint:
- **SSE URL:** `https://mcp.senviok.live/sse`
- **Headers:** `Authorization: Bearer <SENVIOK_API_KEY>`

### Claude Desktop / Cursor (Local or Remote)
Add to your `claude_desktop_config.json` or Cursor MCP settings:
```json
{
  "mcpServers": {
    "senviok": {
      "url": "http://localhost:3001/sse",
      "headers": {
        "Authorization": "Bearer snk_live_xxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

---

## Docker Deployment

```bash
docker build -t senviok-remote-mcp .
docker run -p 3001:3001 -e PORT=3001 senviok-remote-mcp
```
