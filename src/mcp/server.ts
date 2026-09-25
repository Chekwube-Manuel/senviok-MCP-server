import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SenviokApiClient } from "../client/senviokApi.js";

/**
 * Creates and configures an MCP server instance with the full suite of Senviok tools.
 * Supports multi-tenancy: each session can carry its own active Senviok API key.
 */
export function createSenviokMcpServer(sessionApiKey?: string) {
  const server = new McpServer({
    name: "senviok-remote-mcp",
    version: "1.1.0",
  });

  const getClient = (overrideKey?: string) => {
    return new SenviokApiClient(overrideKey || sessionApiKey);
  };

  // ==========================================
  // 1. EMAIL TOOLS
  // ==========================================
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
      addUnsubscribeFooter: z.boolean().optional().describe("Whether to append automated unsubscribe link"),
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
          addUnsubscribeFooter: args.addUnsubscribeFooter,
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

  // ==========================================
  // 2. SMS & WHATSAPP TOOLS
  // ==========================================
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

  server.tool(
    "senviok_send_whatsapp",
    "Send a WhatsApp message via Senviok WhatsApp infrastructure. Supports direct text or pre-approved WhatsApp templates.",
    {
      to: z.string().describe("Recipient phone number in international format (e.g. +2348012345678)"),
      text: z.string().describe("Message text content"),
      templateId: z.string().optional().describe("Optional pre-approved WhatsApp template ID for proactive messages"),
      data: z.record(z.any()).optional().describe("Template dynamic parameters (e.g. { 'customer_name': 'Ada' })"),
      deviceId: z.string().optional().describe("Optional WhatsApp device ID"),
      apiKey: z.string().optional().describe("Optional Senviok API key override for this operation"),
    },
    async (args) => {
      try {
        const client = getClient(args.apiKey);
        const result = await client.sendWhatsApp({
          to: args.to,
          text: args.text,
          templateId: args.templateId,
          data: args.data,
          deviceId: args.deviceId,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: "WhatsApp message dispatched successfully",
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
          content: [{ type: "text", text: `Error sending WhatsApp message: ${err.message}` }],
        };
      }
    }
  );

  // ==========================================
  // 3. TEMPLATE MANAGEMENT TOOLS
  // ==========================================
  server.tool(
    "senviok_list_templates",
    "List all saved email templates in the user's Senviok library.",
    {
      apiKey: z.string().optional().describe("Optional Senviok API key override for this operation"),
    },
    async (args) => {
      try {
        const client = getClient(args.apiKey);
        const result = await client.listTemplates();

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error listing templates: ${err.message}` }],
        };
      }
    }
  );

  server.tool(
    "senviok_get_template",
    "Get full details and HTML content of a specific email template by ID.",
    {
      templateId: z.string().describe("The UUID of the template"),
      apiKey: z.string().optional().describe("Optional Senviok API key override for this operation"),
    },
    async (args) => {
      try {
        const client = getClient(args.apiKey);
        const result = await client.getTemplate(args.templateId);

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error getting template: ${err.message}` }],
        };
      }
    }
  );

  server.tool(
    "senviok_create_template",
    "Create and save a new responsive HTML email template into the Senviok library.",
    {
      name: z.string().describe("Friendly name of the template (e.g. 'Welcome Onboarding')"),
      subject: z.string().describe("Default email subject line"),
      htmlContent: z.string().describe("Responsive HTML email body"),
      apiKey: z.string().optional().describe("Optional Senviok API key override for this operation"),
    },
    async (args) => {
      try {
        const client = getClient(args.apiKey);
        const result = await client.createTemplate({
          name: args.name,
          subject: args.subject,
          htmlContent: args.htmlContent,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: "Template created successfully",
                  template: result,
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
          content: [{ type: "text", text: `Error creating template: ${err.message}` }],
        };
      }
    }
  );

  // ==========================================
  // 4. AUDIENCES & CONTACTS (CRM) TOOLS
  // ==========================================
  server.tool(
    "senviok_list_audiences",
    "List all contact audience lists in Senviok.",
    {
      apiKey: z.string().optional().describe("Optional Senviok API key override for this operation"),
    },
    async (args) => {
      try {
        const client = getClient(args.apiKey);
        const result = await client.listAudiences();

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error listing audiences: ${err.message}` }],
        };
      }
    }
  );

  server.tool(
    "senviok_create_audience",
    "Create a new contact audience list for marketing campaigns and broadcasts.",
    {
      name: z.string().describe("Name of the new audience list (e.g. 'VIP Customers')"),
      apiKey: z.string().optional().describe("Optional Senviok API key override for this operation"),
    },
    async (args) => {
      try {
        const client = getClient(args.apiKey);
        const result = await client.createAudience(args.name);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: "Audience created successfully",
                  audience: result,
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
          content: [{ type: "text", text: `Error creating audience: ${err.message}` }],
        };
      }
    }
  );

  server.tool(
    "senviok_add_contact",
    "Add a new contact/subscriber to an audience list with name and email attributes.",
    {
      audienceId: z.string().describe("UUID of the target audience list"),
      email: z.string().describe("Contact email address"),
      firstName: z.string().optional().describe("Contact first name"),
      lastName: z.string().optional().describe("Contact last name"),
      apiKey: z.string().optional().describe("Optional Senviok API key override for this operation"),
    },
    async (args) => {
      try {
        const client = getClient(args.apiKey);
        const result = await client.addContact({
          audienceId: args.audienceId,
          email: args.email,
          firstName: args.firstName,
          lastName: args.lastName,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: "Contact added to audience",
                  contact: result,
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
          content: [{ type: "text", text: `Error adding contact: ${err.message}` }],
        };
      }
    }
  );

  // ==========================================
  // 5. SUPPRESSION & DELIVERABILITY TOOLS
  // ==========================================
  server.tool(
    "senviok_list_suppressions",
    "List suppressed, bounced, or unsubscribed email addresses.",
    {
      apiKey: z.string().optional().describe("Optional Senviok API key override for this operation"),
    },
    async (args) => {
      try {
        const client = getClient(args.apiKey);
        const result = await client.listSuppressions();

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error listing suppressions: ${err.message}` }],
        };
      }
    }
  );

  server.tool(
    "senviok_add_suppression",
    "Manually suppress an email address to protect sender reputation.",
    {
      email: z.string().describe("Email address to suppress"),
      reason: z.string().optional().describe("Reason for suppression (e.g. 'Unsubscribe request')"),
      apiKey: z.string().optional().describe("Optional Senviok API key override for this operation"),
    },
    async (args) => {
      try {
        const client = getClient(args.apiKey);
        const result = await client.addSuppression(args.email, args.reason);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: "Email suppressed successfully",
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
          content: [{ type: "text", text: `Error adding suppression: ${err.message}` }],
        };
      }
    }
  );

  server.tool(
    "senviok_remove_suppression",
    "Remove an email address from the suppression list, restoring its ability to receive emails.",
    {
      suppressionId: z.string().describe("UUID of the suppression record to remove"),
      apiKey: z.string().optional().describe("Optional Senviok API key override for this operation"),
    },
    async (args) => {
      try {
        const client = getClient(args.apiKey);
        await client.deleteSuppression(args.suppressionId);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `Suppression record '${args.suppressionId}' removed successfully`,
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
          content: [{ type: "text", text: `Error removing suppression: ${err.message}` }],
        };
      }
    }
  );

  // ==========================================
  // 6. DOMAIN TOOLS
  // ==========================================
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
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error listing domains: ${err.message}` }],
        };
      }
    }
  );

  server.tool(
    "senviok_create_domain",
    "Register a new sending domain in Senviok and generate required DNS records (SPF, DKIM, MX).",
    {
      name: z.string().describe("Domain name (e.g. 'mail.yourdomain.com' or 'yourdomain.com')"),
      apiKey: z.string().optional().describe("Optional Senviok API key override for this operation"),
    },
    async (args) => {
      try {
        const client = getClient(args.apiKey);
        const result = await client.createDomain(args.name);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: "Domain registered successfully. Please configure the provided DNS records.",
                  domain: result,
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
          content: [{ type: "text", text: `Error creating domain: ${err.message}` }],
        };
      }
    }
  );

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

  server.tool(
    "senviok_get_domain_dns_records",
    "Retrieve the exact DNS TXT and CNAME records needed to verify DKIM, SPF, and DMARC for a domain.",
    {
      domainId: z.string().describe("The UUID of the domain"),
      apiKey: z.string().optional().describe("Optional Senviok API key override for this operation"),
    },
    async (args) => {
      try {
        const client = getClient(args.apiKey);
        const result = await client.getDomainDkim(args.domainId);

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error retrieving DNS records: ${err.message}` }],
        };
      }
    }
  );

  // ==========================================
  // 7. WEBHOOK TOOLS
  // ==========================================
  server.tool(
    "senviok_list_webhooks",
    "List all registered webhook endpoints and their subscribed events (e.g. email.delivered, email.bounced).",
    {
      apiKey: z.string().optional().describe("Optional Senviok API key override for this operation"),
    },
    async (args) => {
      try {
        const client = getClient(args.apiKey);
        const result = await client.listWebhooks();

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error listing webhooks: ${err.message}` }],
        };
      }
    }
  );

  server.tool(
    "senviok_create_webhook",
    "Register a new webhook destination URL to receive real-time delivery and bounce events.",
    {
      url: z.string().url().describe("HTTPS endpoint URL to receive webhook payloads"),
      events: z.array(z.string()).describe("Events to subscribe to (e.g. ['email.delivered', 'email.bounced', 'email.complained'])"),
      apiKey: z.string().optional().describe("Optional Senviok API key override for this operation"),
    },
    async (args) => {
      try {
        const client = getClient(args.apiKey);
        const result = await client.createWebhook({
          url: args.url,
          events: args.events,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: "Webhook registered successfully",
                  webhook: result,
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
          content: [{ type: "text", text: `Error creating webhook: ${err.message}` }],
        };
      }
    }
  );

  // ==========================================
  // 8. ACCOUNT & BILLING TOOLS
  // ==========================================
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
