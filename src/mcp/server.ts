import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SenviokApiClient } from "../client/senviokApi.js";

/**
 * Creates and configures an MCP server instance with all Senviok tools.
 * Supports multi-tenancy: each session can carry its own active Senviok API key.
 */
export function createSenviokMcpServer(sessionApiKey?: string) {
  const server = new McpServer({
    name: "senviok-remote-mcp",
    version: "1.0.0",
  });

  const getClient = (overrideKey?: string) => {
    return new SenviokApiClient(overrideKey || sessionApiKey);
  };

  // 1. Tool: Send Email
  server.tool(
    "senviok_send_email",
    "Send a transactional or marketing email via Senviok API. Supports HTML, plain text, custom from address, and dynamic templates.",
    {
      to: z.union([z.string(), z.array(z.string())]).describe("Recipient email address or array of recipient addresses"),
      subject: z.string().describe("Email subject line"),
      html: z.string().optional().describe("HTML formatted content of the email"),
      text: z.string().optional().describe("Plaintext fallback content"),
      from: z.string().optional().describe("Verified sender email address (e.g. info@yourdomain.com)"),
      fromName: z.string().optional().describe("Friendly sender display name"),
      replyTo: z.union([z.string(), z.array(z.string())]).optional().describe("Reply-To email address"),
      templateId: z.string().optional().describe("Optional Senviok template ID"),
      templateData: z.record(z.string()).optional().describe("Key-value variables for template interpolation"),
      apiKey: z.string().optional().describe("Optional Senviok API key override for this operation"),
    },
    async (args) => {
      try {
        const client = getClient(args.apiKey);
        const result = await client.sendEmail({
          to: args.to,
          subject: args.subject,
          html: args.html,
          text: args.text,
          from: args.from,
          fromName: args.fromName,
          replyTo: args.replyTo,
          templateId: args.templateId,
          templateData: args.templateData,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: "Email queued successfully for delivery",
                  messageId: result.id,
                  details: result,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error sending email: ${err.message}` }],
        };
      }
    }
  );

  // 2. Tool: Get Email Logs & Delivery Status
  server.tool(
    "senviok_get_email_logs",
    "Search and inspect real-time delivery logs, open rates, clicks, bounces, and statuses for sent emails.",
    {
      search: z.string().optional().describe("Optional search term (email address or subject)"),
      status: z.enum(["Delivered", "Sent", "Bounced", "Failed", "Opened", "Clicked"]).optional().describe("Filter by email status"),
      page: z.number().int().positive().optional().describe("Page number (default: 1)"),
      pageSize: z.number().int().positive().optional().describe("Results per page (default: 20, max: 100)"),
      apiKey: z.string().optional().describe("Optional Senviok API key override for this operation"),
    },
    async (args) => {
      try {
        const client = getClient(args.apiKey);
        const result = await client.getEmailLogs({
          search: args.search,
          status: args.status,
          page: args.page,
          pageSize: args.pageSize,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error retrieving email logs: ${err.message}` }],
        };
      }
    }
  );

  // 3. Tool: Send SMS
  server.tool(
    "senviok_send_sms",
    "Send an SMS text message to any phone number using an approved Sender ID via Senviok.",
    {
      to: z.string().describe("Recipient phone number in international E.164 format (e.g. +2348012345678)"),
      message: z.string().describe("SMS message content (160 characters per unit)"),
      senderId: z.string().optional().describe("Approved sender identity/name"),
      apiKey: z.string().optional().describe("Optional Senviok API key override for this operation"),
    },
    async (args) => {
      try {
        const client = getClient(args.apiKey);
        const result = await client.sendSms({
          to: args.to,
          message: args.message,
          senderId: args.senderId,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: "SMS dispatched successfully",
                  result,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error sending SMS: ${err.message}` }],
        };
      }
    }
  );

  // 4. Tool: List Sending Domains
  server.tool(
    "senviok_list_domains",
    "List all registered sending domains and their current DNS verification status (SPF, DKIM, DMARC, MX).",
    {
      apiKey: z.string().optional().describe("Optional Senviok API key override for this operation"),
    },
    async (args) => {
      try {
        const client = getClient(args.apiKey);
        const result = await client.listDomains();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error listing domains: ${err.message}` }],
        };
      }
    }
  );

  // 5. Tool: Verify Domain DNS
  server.tool(
    "senviok_verify_domain",
    "Trigger DNS check for a registered domain to confirm SPF and DKIM DNS records have propagated.",
    {
      domainId: z.string().describe("The UUID of the domain to verify"),
      apiKey: z.string().optional().describe("Optional Senviok API key override for this operation"),
    },
    async (args) => {
      try {
        const client = getClient(args.apiKey);
        const result = await client.verifyDomain(args.domainId);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: "Domain verification initiated",
                  result,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error verifying domain: ${err.message}` }],
        };
      }
    }
  );

  // 6. Tool: Get Account Balance & Quota
  server.tool(
    "senviok_get_account_balance",
    "Get account billing info, current tier plan, remaining email/SMS credits, and usage stats.",
    {
      apiKey: z.string().optional().describe("Optional Senviok API key override for this operation"),
    },
    async (args) => {
      try {
        const client = getClient(args.apiKey);
        const [billing, stats] = await Promise.allSettled([
          client.getTenantBilling(),
          client.getAnalyticsStats(),
        ]);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  billing: billing.status === "fulfilled" ? billing.value : { error: billing.reason?.message },
                  stats: stats.status === "fulfilled" ? stats.value : { error: stats.reason?.message },
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error retrieving balance and usage: ${err.message}` }],
        };
      }
    }
  );

  return server;
}
