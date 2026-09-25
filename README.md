# Senviok Remote MCP Server

A cloud-hosted **Model Context Protocol (MCP)** server that exposes [Senviok's](https://senviok.live) email, SMS, domain verification, and delivery diagnostics APIs to AI agents and web platforms (such as Claude, ChatGPT, Cursor, and OkeyMeta).

Built with TypeScript and the official `@modelcontextprotocol/sdk`.

---

## 🌟 Key Features

- **Zero Client Installs**: Runs as a remote HTTP/Server-Sent Events (SSE) service. Web AI platforms (e.g. OkeyMeta, ChatGPT Custom Actions) connect directly over HTTPS without end-users needing Node or CLI tools.
- **Instant Rollouts**: Add new tools to the server, and all connected AI agents immediately discover and use them on their next session without reinstalling or updating anything.
- **Multi-Tenant Authentication**: Clients supply their Senviok API key via `Authorization: Bearer <key>`, `x-api-key: <key>`, `?api_key=<key>`, or as a per-tool `apiKey` argument.

---

## 🛠️ Available Tools

| Tool | Description |
| :--- | :--- |
| `senviok_send_email` | Send transactional or marketing emails with HTML, text, and dynamic templates. |
| `senviok_get_email_logs` | Search delivery logs, check bounce reasons, and inspect open/click tracking. |
| `senviok_send_sms` | Send SMS messages via approved Sender IDs. |
| `senviok_list_domains` | View registered sending domains and SPF, DKIM, DMARC verification status. |
| `senviok_verify_domain` | Trigger live DNS check for SPF/DKIM propagation. |
| `senviok_get_account_balance` | Retrieve plan tier, remaining email/SMS credits, and usage stats. |

---

## 🚀 Quick Start (Local Development)

### 1. Install & Build
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

## 🌐 Connecting from AI Platforms

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

## 🐳 Docker Deployment

```bash
docker build -t senviok-remote-mcp .
docker run -p 3001:3001 -e PORT=3001 senviok-remote-mcp
```
