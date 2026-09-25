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
  senderId?: string;
  channel?: "dnd" | "whatsapp" | "generic";
}

export class SenviokApiClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey || config.defaultApiKey;
    this.baseUrl = baseUrl || config.senviokBaseUrl;

    if (!this.apiKey) {
      throw new Error(
        "Senviok API key missing. Please provide it via Authorization header (Bearer <key>), ?api_key=<key> query parameter, SENVIOK_API_KEY env var, or as an 'apiKey' tool argument."
      );
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      ...(options.headers as Record<string, string> || {}),
    };

    const res = await fetch(url, {
      ...options,
      headers,
    });

    const contentType = res.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const data = isJson ? await res.json() : await res.text();

    if (!res.ok) {
      const errorMessage =
        typeof data === "object" && data !== null && (data as any).message
          ? (data as any).message
          : typeof data === "string"
          ? data
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
  } = {}): Promise<any> {
    const query = new URLSearchParams();
    if (params.page) query.set("page", params.page.toString());
    if (params.pageSize) query.set("pageSize", params.pageSize.toString());
    if (params.search) query.set("search", params.search);
    if (params.status) query.set("status", params.status);

    const queryString = query.toString() ? `?${query.toString()}` : "";
    return this.request(`/analytics/logs${queryString}`, { method: "GET" });
  }

  // --- SMS Operations ---
  async sendSms(payload: SendSmsPayload): Promise<{ id?: string; messageId?: string; status?: string }> {
    return this.request<{ id?: string; messageId?: string; status?: string }>("/sms", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  // --- Domain Operations ---
  async listDomains(): Promise<any> {
    return this.request("/domains", { method: "GET" });
  }

  async verifyDomain(domainId: string): Promise<any> {
    return this.request(`/domains/${domainId}/verify`, { method: "POST" });
  }

  // --- Account & Billing Operations ---
  async getTenantBilling(): Promise<any> {
    return this.request("/billing/tenant", { method: "GET" });
  }

  async getAnalyticsStats(): Promise<any> {
    return this.request("/analytics/stats", { method: "GET" });
  }
}
