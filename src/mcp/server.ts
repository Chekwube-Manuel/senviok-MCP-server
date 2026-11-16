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
    version: "1.1.2",
  });

  const toolScopes: Record<string, string> = {
    senviok_send_email: "email:send", senviok_get_email_logs: "email:read",
    senviok_list_inbox: "inbox:read", senviok_get_inbox_message: "inbox:read", senviok_reply_to_inbox_message: "inbox:reply",
    senviok_send_sms: "sms:send", senviok_send_whatsapp: "whatsapp:send",
    senviok_list_templates: "templates:read", senviok_get_template: "templates:read", senviok_create_template: "templates:write",
    senviok_list_audiences: "audiences:read", senviok_create_audience: "audiences:write", senviok_add_contact: "audiences:write",
    senviok_list_suppressions: "suppressions:read", senviok_add_suppression: "suppressions:write", senviok_remove_suppression: "suppressions:write",
    senviok_list_domains: "domains:read", senviok_create_domain: "domains:write", senviok_verify_domain: "domains:write", senviok_get_domain_dns_records: "domains:read",
    senviok_list_webhooks: "webhooks:read", senviok_create_webhook: "webhooks:write", senviok_get_account_balance: "account:read",
  };
  const typedServer = server as unknown as { tool: (...args: any[]) => unknown };
  typedServer.tool = (name: string, description: string, inputSchema: Record<string, unknown>, callback: (...args: any[]) => unknown) =>
    server.registerTool(name, {
      description,
      inputSchema: inputSchema as any,
      _meta: { securitySchemes: [{ type: "oauth2", scopes: [toolScopes[name] ?? "email:read"] }] },
    }, callback as any);

  const getClient = () => new SenviokApiClient(sessionApiKey);

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
      templateData: z.record(z.string(), z.string()).optional().describe("Key-value variables for template interpolation"),
      addUnsubscribeFooter: z.boolean().optional().describe("Whether to append automated unsubscribe link"),
    },
    async (args) => {
      try {
        const client = getClient();
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
      channel: z.enum(["Email", "SMS", "WhatsApp"]).optional().describe("Filter by message channel"),
      toAddress: z.string().optional().describe("Filter by recipient address or phone number"),
      subject: z.string().optional().describe("Filter by email subject"),
      page: z.number().int().positive().optional().describe("Page number (default: 1)"),
      pageSize: z.number().int().positive().optional().describe("Results per page (default: 20, max: 100)"),
      startDate: z.string().optional().describe("Filter start date (ISO 8601)"),
      endDate: z.string().optional().describe("Filter end date (ISO 8601)"),
    },
    async (args) => {
      try {
        const client = getClient();
        const result = await client.getEmailLogs({
          search: args.search,
          status: args.status,
          page: args.page,
          pageSize: args.pageSize,
          channel: args.channel,
          toAddress: args.toAddress,
          subject: args.subject,
          startDate: args.startDate,
          endDate: args.endDate,
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

  // Inbox tools let an agent inspect and respond to mail received by the
  // authenticated Senviok workspace. Replies are sent as email, so call only
  // after the user has asked to reply or approved the drafted response.
  server.tool(
    "senviok_list_inbox",
    "List inbound email messages in the connected Senviok workspace. Supports search and pagination.",
    {
      limit: z.number().int().min(1).max(100).optional().describe("Maximum messages to return (default 50, max 100)"),
      offset: z.number().int().min(0).optional().describe("Number of messages to skip"),
      search: z.string().optional().describe("Search sender, recipient, subject, or message text"),
    },
    async (args) => {
      try {
        const result = await getClient().listInbox(args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: "text", text: `Error listing inbox: ${err.message}` }] };
      }
    }
  );

  server.tool(
    "senviok_get_inbox_message",
    "Read one inbound email and its attachment metadata from the connected Senviok workspace.",
    { messageId: z.string().describe("Senviok inbound message ID") },
    async ({ messageId }) => {
      try {
        const result = await getClient().getInboxMessage(messageId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: "text", text: `Error reading inbox message: ${err.message}` }] };
      }
    }
  );

  server.tool(
    "senviok_reply_to_inbox_message",
    "Send a reply to an inbound email in the connected Senviok workspace. Only use when the user explicitly requested or approved sending the reply.",
    {
      messageId: z.string().describe("Senviok inbound message ID to reply to"),
      subject: z.string().optional().describe("Optional reply subject"),
      textBody: z.string().optional().describe("Plain text reply body"),
      htmlBody: z.string().optional().describe("HTML reply body"),
      attachmentIds: z.array(z.string()).optional().describe("Previously uploaded Senviok attachment IDs to include"),
    },
    async ({ messageId, ...payload }) => {
      try {
        const result = await getClient().replyToInboxMessage(messageId, payload);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err: any) {
        return { isError: true, content: [{ type: "text", text: `Error replying to inbox message: ${err.message}` }] };
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
      senderId: z.string().describe("Your approved sender identity/name (sent as the API's 'from' field)"),
    },
    async (args) => {
      try {
        const client = getClient();
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
      data: z.record(z.string(), z.unknown()).optional().describe("Template dynamic parameters (e.g. { 'customer_name': 'Ada' })"),
      deviceId: z.string().optional().describe("Optional WhatsApp device ID"),
    },
    async (args) => {
      try {
        const client = getClient();
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
    },
    async (args) => {
      try {
        const client = getClient();
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
    },
    async (args) => {
      try {
        const client = getClient();
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
    },
    async (args) => {
      try {
        const client = getClient();
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
    },
    async (args) => {
      try {
        const client = getClient();
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
    },
    async (args) => {
      try {
        const client = getClient();
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
    },
    async (args) => {
      try {
        const client = getClient();
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
    },
    async (args) => {
      try {
        const client = getClient();
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
    },
    async (args) => {
      try {
        const client = getClient();
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
    },
    async (args) => {
      try {
        const client = getClient();
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
    },
    async (args) => {
      try {
        const client = getClient();
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
    },
    async (args) => {
      try {
        const client = getClient();
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
    },
    async (args) => {
      try {
        const client = getClient();
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
    },
    async (args) => {
      try {
        const client = getClient();
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
    },
    async (args) => {
      try {
        const client = getClient();
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
      url: z.string().url().refine((value) => new URL(value).protocol === "https:", "Webhook URL must use HTTPS").describe("HTTPS endpoint URL to receive webhook payloads"),
      events: z.array(z.string()).describe("Events to subscribe to (e.g. ['email.delivered', 'email.bounced', 'email.complained'])"),
    },
    async (args) => {
      try {
        const client = getClient();
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
    },
    async (args) => {
      try {
        const client = getClient();
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
