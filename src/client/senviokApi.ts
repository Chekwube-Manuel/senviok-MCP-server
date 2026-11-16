import { config } from "../config.js";

export interface SendEmailPayload {
  from?: string;
  fromName?: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string | string[];
  templateId?: string;
  templateData?: Record<string, string>;
  addUnsubscribeFooter?: boolean;
}

export interface SendSmsPayload {
  to: string;
  message: string;
  senderId: string;
}

export interface SendWhatsAppPayload {
  to: string;
  text: string;
  templateId?: string;
  data?: Record<string, any>;
  deviceId?: string;
}

export interface CreateTemplatePayload {
  name: string;
  subject: string;
  htmlContent: string;
  mjmlContent?: string;
  jsxSource?: string;
}

export interface CreateContactPayload {
  audienceId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  unsubscribed?: boolean;
}

export interface CreateWebhookPayload {
  url: string;
  events: string[];
}

export class SenviokApiClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey || config.defaultApiKey;
    this.baseUrl = baseUrl || config.senviokBaseUrl;

    if (!this.apiKey) {
      throw new Error(
        "Senviok credentials are missing. Connect this MCP server with Senviok OAuth, or provide a legacy API key using the Authorization bearer header."
      );
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${this.apiKey}`,
      ...(options.headers as Record<string, string> || {}),
    };

    const res = await fetch(url, {
      ...options,
      headers,
      signal: options.signal ?? AbortSignal.timeout(30_000),
    });

    const contentType = res.headers.get("content-type") || "";
    const responseText = await res.text();
    let data: unknown = responseText;
    if (contentType.includes("application/json") && responseText) {
      try { data = JSON.parse(responseText); } catch { /* retain raw response for useful diagnostics */ }
    }

    if (!res.ok) {
      const errorMessage =
        typeof data === "object" && data !== null && ((data as any).message || (data as any).Message || (data as any).error)
          ? (data as any).message || (data as any).Message || (data as any).error
          : typeof data === "string"
          ? data || `HTTP ${res.status} ${res.statusText}`
          : `HTTP ${res.status} ${res.statusText}`;
      throw new Error(errorMessage);
    }

    return data as T;
  }

  // --- Email Operations ---
  async sendEmail(payload: SendEmailPayload): Promise<{ id: string; message?: string }> {
    return this.request<{ id: string; message?: string }>("/emails", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async getEmailLogs(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    channel?: string;
    toAddress?: string;
    subject?: string;
    startDate?: string;
    endDate?: string;
  } = {}): Promise<any> {
    const query = new URLSearchParams();
    const take = Math.min(Math.max(params.pageSize ?? 20, 1), 100);
    const page = Math.max(params.page ?? 1, 1);
    query.set("skip", String((page - 1) * take));
    query.set("take", String(take));
    if (params.search && !params.subject) {
      query.set(params.search.includes("@") ? "toAddress" : "subject", params.search);
    }
    if (params.subject) query.set("subject", params.subject);
    if (params.channel) query.set("channel", params.channel);
    if (params.toAddress) query.set("toAddress", params.toAddress);
    if (params.status) query.set("status", params.status);
    if (params.startDate) query.set("startDate", params.startDate);
    if (params.endDate) query.set("endDate", params.endDate);

    const queryString = query.toString() ? `?${query.toString()}` : "";
    return this.request(`/analytics/logs${queryString}`, { method: "GET" });
  }

  // --- Inbox operations ---
  async listInbox(params: { limit?: number; offset?: number; search?: string } = {}): Promise<any> {
    const query = new URLSearchParams();
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    if (params.offset !== undefined) query.set("offset", String(params.offset));
    if (params.search) query.set("search", params.search);
    const suffix = query.size ? `?${query.toString()}` : "";
    return this.request(`/inbox${suffix}`, { method: "GET" });
  }

  async getInboxMessage(id: string): Promise<any> {
    return this.request(`/inbox/${encodeURIComponent(id)}`, { method: "GET" });
  }

  async replyToInboxMessage(id: string, payload: { subject?: string; htmlBody?: string; textBody?: string; attachmentIds?: string[] }): Promise<any> {
    return this.request(`/inbox/${encodeURIComponent(id)}/reply`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  // --- SMS Operations ---
  async sendSms(payload: SendSmsPayload): Promise<{ id?: string; messageId?: string; status?: string }> {
    return this.request<{ id?: string; messageId?: string; status?: string }>("/sms", {
      method: "POST",
      body: JSON.stringify({ to: payload.to, from: payload.senderId, text: payload.message }),
    });
  }

  // --- WhatsApp Operations ---
  async sendWhatsApp(payload: SendWhatsAppPayload): Promise<{ id: string }> {
    return this.request<{ id: string }>("/whatsapp", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  // --- Template Operations ---
  async listTemplates(): Promise<any> {
    return this.request("/templates", { method: "GET" });
  }

  async getTemplate(templateId: string): Promise<any> {
    return this.request(`/templates/${encodeURIComponent(templateId)}`, { method: "GET" });
  }

  async createTemplate(payload: CreateTemplatePayload): Promise<any> {
    return this.request("/templates", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  // --- Audience & Contact Operations ---
  async listAudiences(): Promise<any> {
    return this.request("/audiences", { method: "GET" });
  }

  async createAudience(name: string): Promise<any> {
    return this.request("/audiences", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  async addContact(payload: CreateContactPayload): Promise<any> {
    return this.request(`/audiences/${encodeURIComponent(payload.audienceId)}/contacts`, {
      method: "POST",
      body: JSON.stringify({
        email: payload.email,
        firstName: payload.firstName,
        lastName: payload.lastName,
        unsubscribed: payload.unsubscribed ?? false,
      }),
    });
  }

  // --- Suppression Operations ---
  async listSuppressions(): Promise<any> {
    return this.request("/suppressions", { method: "GET" });
  }

  async addSuppression(email: string, reason?: string): Promise<any> {
    return this.request("/suppressions", {
      method: "POST",
      body: JSON.stringify({ email, reason: reason || "Manual suppression" }),
    });
  }

  async deleteSuppression(id: string): Promise<any> {
    return this.request(`/suppressions/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  // --- Domain Operations ---
  async listDomains(): Promise<any> {
    return this.request("/domains", { method: "GET" });
  }

  async createDomain(name: string): Promise<any> {
    return this.request("/domains", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  async verifyDomain(domainId: string): Promise<any> {
    return this.request(`/domains/${encodeURIComponent(domainId)}/verify`, { method: "POST" });
  }

  async getDomainDkim(domainId: string): Promise<any> {
    return this.request(`/domains/${encodeURIComponent(domainId)}/dkim`, { method: "GET" });
  }

  // --- Webhook Operations ---
  async listWebhooks(): Promise<any> {
    return this.request("/webhooks", { method: "GET" });
  }

  async createWebhook(payload: CreateWebhookPayload): Promise<any> {
    return this.request("/webhooks", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async deleteWebhook(webhookId: string): Promise<any> {
    return this.request(`/webhooks/${encodeURIComponent(webhookId)}`, { method: "DELETE" });
  }

  // --- Account & Billing Operations ---
  async getTenantBilling(): Promise<any> {
    return this.request("/billing/tenant", { method: "GET" });
  }

  async getAnalyticsStats(): Promise<any> {
    return this.request("/analytics/stats", { method: "GET" });
  }
}
