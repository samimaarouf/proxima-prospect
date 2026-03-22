// src/lib/modules/conversations/services/UnipileService.ts
// Low-level wrapper around Unipile REST API for Email, LinkedIn, WhatsApp

import { env } from "$env/dynamic/private";

// ============================================
// Types for Unipile API
// ============================================

export interface UnipileRecipient {
  display_name?: string;
  identifier: string; // email address or user ID
}

export interface UnipileSendEmailParams {
  accountId: string;
  to: UnipileRecipient[];
  subject: string;
  body: string;
  cc?: UnipileRecipient[];
  replyTo?: string; // provider_id of email to reply to
  attachments?: { blob: Blob; filename: string }[];
  trackingOptions?: {
    opens?: boolean;
    links?: boolean;
    label?: string;
  };
}

export interface UnipileSendEmailResult {
  success: boolean;
  emailId?: string;
  error?: string;
}

export interface UnipileEmail {
  id: string;
  provider_id: string;
  account_id: string;
  subject: string;
  body: string;
  body_plain?: string;
  from: UnipileRecipient;
  to: UnipileRecipient[];
  cc?: UnipileRecipient[];
  date: string; // ISO date string
  read: boolean;
  folders?: string[];
  thread_id?: string;
  in_reply_to?: string;
  attachments?: Array<{
    id: string;
    name: string;
    size: number;
    content_type: string;
  }>;
}

export interface UnipileEmailListResponse {
  items: UnipileEmail[];
  cursor?: string;
}

export interface UnipileAccount {
  id: string;
  type: string; // "GOOGLE", "MICROSOFT", "IMAP", "LINKEDIN", "WHATSAPP", etc.
  name: string;
  identifier?: string; // email address or phone number
  created_at: string;
  status: string;
}

export interface UnipileAccountListResponse {
  items: UnipileAccount[];
  cursor?: string;
}

export interface UnipileChat {
  id: string;
  account_id: string;
  provider_id: string;
  type: string; // "INDIVIDUAL", "GROUP"
  name?: string;
  attendees: Array<{
    id: string;
    name: string;
    identifier?: string;
  }>;
  last_message_at?: string;
  unread_count?: number;
}

export interface UnipileChatListResponse {
  items: UnipileChat[];
  cursor?: string;
}

export interface UnipileMessage {
  id: string;
  chat_id: string;
  account_id: string;
  provider_id: string;
  text: string;
  sender_id: string;
  sender_name?: string;
  timestamp: string;
  is_sender: boolean;
  attachments?: Array<{
    id: string;
    name: string;
    size: number;
    content_type: string;
    url?: string;
  }>;
}

export interface UnipileMessageListResponse {
  items: UnipileMessage[];
  cursor?: string;
}

// ============================================
// UnipileService Class
// ============================================

export class UnipileService {
  private apiKey: string;
  private dsn: string;
  private baseUrl: string;

  constructor(apiKey?: string, dsn?: string) {
    this.apiKey = apiKey || env.UNIPILE_API_KEY || "";
    this.dsn = dsn || env.UNIPILE_DSN || "api1.unipile.com:13111";
    this.baseUrl = `https://${this.dsn}/api/v1`;
  }

  // ============================================
  // Helper Methods
  // ============================================

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: Record<string, string> = {
      "X-API-KEY": this.apiKey,
      "Accept": "application/json",
      ...(options.headers as Record<string, string> || {}),
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Unipile API error (${response.status}):`, errorText);
      let detail = "";
      try {
        const parsed = JSON.parse(errorText);
        if (parsed.type) detail = parsed.type;
      } catch { /* ignore */ }
      throw new Error(`Unipile API error: ${response.status} ${response.statusText}${detail ? ` (${detail})` : ""}`);
    }

    return response.json();
  }

  private async requestFormData<T>(
    endpoint: string,
    formData: FormData
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "X-API-KEY": this.apiKey,
        "Accept": "application/json",
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Unipile API error (${response.status}):`, errorText);
      throw new Error(`Unipile API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  // ============================================
  // Account Methods
  // ============================================

  /**
   * List all connected accounts
   */
  async listAccounts(): Promise<UnipileAccountListResponse> {
    return this.request<UnipileAccountListResponse>("/accounts");
  }

  /**
   * Get a specific account by ID
   */
  async getAccount(accountId: string): Promise<UnipileAccount> {
    return this.request<UnipileAccount>(`/accounts/${accountId}`);
  }

  /**
   * Delete/disconnect an account
   */
  async deleteAccount(accountId: string): Promise<void> {
    await this.request(`/accounts/${accountId}`, { method: "DELETE" });
  }

  // ============================================
  // Email Methods
  // ============================================

  /**
   * Send an email
   */
  async sendEmail(params: UnipileSendEmailParams): Promise<UnipileSendEmailResult> {
    try {
      // Convert plain text to HTML to preserve line breaks in email clients.
      // If the body is already HTML (contains tags), use it as-is.
      const isHtml = /<[a-z][\s\S]*>/i.test(params.body);
      const htmlBody = isHtml
        ? params.body
        : `<div>${params.body
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\n/g, "<br>")}</div>`;

      const formData = new FormData();
      formData.append("account_id", params.accountId);
      formData.append("subject", params.subject);
      formData.append("body", htmlBody);
      formData.append("to", JSON.stringify(params.to));
      
      if (params.cc && params.cc.length > 0) {
        formData.append("cc", JSON.stringify(params.cc));
      }
      
      if (params.replyTo) {
        formData.append("reply_to", params.replyTo);
      }
      
      if (params.trackingOptions) {
        formData.append("tracking_options", JSON.stringify(params.trackingOptions));
      }

      if (params.attachments?.length) {
        for (const att of params.attachments) {
          formData.append("attachments", att.blob, att.filename);
        }
      }

      const result = await this.requestFormData<{ id: string }>("/emails", formData);
      
      return {
        success: true,
        emailId: result.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * List emails for an account
   */
  async listEmails(
    accountId: string,
    options?: {
      folder?: string;
      limit?: number;
      cursor?: string;
    }
  ): Promise<UnipileEmailListResponse> {
    const params = new URLSearchParams();
    params.append("account_id", accountId);
    
    if (options?.folder) params.append("folder", options.folder);
    if (options?.limit) params.append("limit", options.limit.toString());
    if (options?.cursor) params.append("cursor", options.cursor);

    return this.request<UnipileEmailListResponse>(`/emails?${params.toString()}`);
  }

  /**
   * Get a specific email by ID
   */
  async getEmail(emailId: string): Promise<UnipileEmail> {
    return this.request<UnipileEmail>(`/emails/${emailId}`);
  }

  /**
   * List email folders for an account
   */
  async listEmailFolders(accountId: string): Promise<{ items: Array<{ id: string; name: string }> }> {
    return this.request(`/emails/folders?account_id=${accountId}`);
  }

  // ============================================
  // Messaging Methods (LinkedIn, WhatsApp, etc.)
  // ============================================

  /**
   * List chats for an account
   */
  async listChats(
    accountId: string,
    options?: {
      limit?: number;
      cursor?: string;
    }
  ): Promise<UnipileChatListResponse> {
    const params = new URLSearchParams();
    params.append("account_id", accountId);
    
    if (options?.limit) params.append("limit", options.limit.toString());
    if (options?.cursor) params.append("cursor", options.cursor);

    return this.request<UnipileChatListResponse>(`/chats?${params.toString()}`);
  }

  /**
   * Get messages in a chat
   */
  async getChatMessages(
    chatId: string,
    options?: {
      limit?: number;
      cursor?: string;
    }
  ): Promise<UnipileMessageListResponse> {
    const params = new URLSearchParams();
    
    if (options?.limit) params.append("limit", options.limit.toString());
    if (options?.cursor) params.append("cursor", options.cursor);

    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request<UnipileMessageListResponse>(`/chats/${chatId}/messages${query}`);
  }

  /**
   * Send a message in an existing chat
   */
  async sendMessageInChat(
    chatId: string,
    text: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const formData = new FormData();
      formData.append("text", text);

      const result = await this.requestFormData<{ id: string }>(
        `/chats/${chatId}/messages`,
        formData
      );
      
      return {
        success: true,
        messageId: result.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Start a new chat with a user
   */
  async startNewChat(params: {
    accountId: string;
    attendeeIds: string[];
    text: string;
    title?: string; // For group chats
    attachments?: { blob: Blob; filename: string }[];
  }): Promise<{ success: boolean; chatId?: string; messageId?: string; error?: string }> {
    try {
      const formData = new FormData();
      formData.append("account_id", params.accountId);
      formData.append("text", params.text);
      
      params.attendeeIds.forEach(id => {
        formData.append("attendees_ids", id);
      });
      
      if (params.title) {
        formData.append("title", params.title);
      }

      if (params.attachments?.length) {
        for (const att of params.attachments) {
          formData.append("attachments", att.blob, att.filename);
        }
      }

      const result = await this.requestFormData<{ chat_id: string; message_id?: string }>(
        "/chats",
        formData
      );
      
      return {
        success: true,
        chatId: result.chat_id,
        messageId: result.message_id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // ============================================
  // Webhook Management
  // ============================================

  /**
   * Register a webhook URL for receiving events
   */
  async registerWebhook(
    url: string,
    events?: string[]
  ): Promise<{ success: boolean; webhookId?: string; error?: string }> {
    try {
      const result = await this.request<{ id: string }>("/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          events: events || ["message.received", "email.received"],
        }),
      });
      
      return {
        success: true,
        webhookId: result.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * List registered webhooks
   */
  async listWebhooks(): Promise<{ items: Array<{ id: string; url: string; events: string[] }> }> {
    return this.request("/webhooks");
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(webhookId: string): Promise<void> {
    await this.request(`/webhooks/${webhookId}`, { method: "DELETE" });
  }

  // ============================================
  // Hosted Auth Link
  // ============================================

  /**
   * Generate a hosted auth link for connecting accounts
   */
  async generateHostedAuthLink(params: {
    providers: ("GOOGLE" | "MICROSOFT" | "IMAP" | "LINKEDIN" | "WHATSAPP")[];
    successRedirectUrl: string;
    failureRedirectUrl: string;
    notifyUrl?: string;
    name?: string;
    expiresOn?: string;
  }): Promise<{ url: string }> {
    const body: Record<string, unknown> = {
      type: "create",
      api_url: `https://${this.dsn}`,
      providers: params.providers,
      success_redirect_url: params.successRedirectUrl,
      failure_redirect_url: params.failureRedirectUrl,
    };

    if (params.expiresOn) {
      body.expiresOn = params.expiresOn;
    }
    
    if (params.notifyUrl) {
      body.notify_url = params.notifyUrl;
    }
    if (params.name) {
      body.name = params.name;
    }

    return this.request<{ url: string }>("/hosted/accounts/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  /**
   * Find the most recently connected account by type
   */
  async findRecentAccountByType(type: string): Promise<UnipileAccount | null> {
    try {
      const accounts = await this.listAccounts();
      // Filter by type and sort by most recent (assuming newer accounts have higher IDs or we can check created_at)
      const matchingAccounts = accounts.items.filter(a => 
        a.type?.toUpperCase() === type.toUpperCase()
      );
      return matchingAccounts.length > 0 ? matchingAccounts[0] : null;
    } catch {
      return null;
    }
  }

  /**
   * Find account by identifier (email)
   */
  async findAccountByIdentifier(identifier: string): Promise<UnipileAccount | null> {
    try {
      const accounts = await this.listAccounts();
      return accounts.items.find(a => 
        a.identifier?.toLowerCase() === identifier.toLowerCase()
      ) || null;
    } catch {
      return null;
    }
  }

  // ============================================
  // LinkedIn-specific methods
  // ============================================

  /**
   * Get a LinkedIn user profile by public identifier (vanity URL username)
   * Returns the provider_id, network_distance, and full profile.
   * network_distance is "FIRST_DEGREE" if already connected, "SECOND_DEGREE", etc.
   */
  async getLinkedInUserProfile(
    accountId: string,
    publicIdentifier: string
  ): Promise<{ 
    success: boolean; 
    providerId?: string;
    networkDistance?: string;
    profile?: Record<string, unknown>;
    error?: string 
  }> {
    try {
      const profile = await this.request<Record<string, unknown>>(
        `/users/${encodeURIComponent(publicIdentifier)}?account_id=${accountId}`
      );

      return {
        success: true,
        providerId: profile.provider_id as string,
        networkDistance: profile.network_distance as string | undefined,
        profile,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Visit a LinkedIn profile (simulates a real profile view)
   * This triggers LinkedIn's "who viewed your profile" notification for the target
   */
  async visitLinkedInProfile(
    accountId: string,
    profileUrl: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Extract LinkedIn profile ID from URL
      const profileId = this.extractLinkedInProfileId(profileUrl);
      if (!profileId) {
        return {
          success: false,
          error: "Invalid LinkedIn profile URL",
        };
      }

      // Use Unipile's profile view endpoint
      await this.request(`/users/${profileId}`, {
        method: "GET",
        headers: {
          "X-Account-Id": accountId,
        },
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get LinkedIn profile information
   */
  async getLinkedInProfile(
    accountId: string,
    profileUrl: string
  ): Promise<{ success: boolean; profile?: LinkedInProfile; error?: string }> {
    try {
      const profileId = this.extractLinkedInProfileId(profileUrl);
      if (!profileId) {
        return {
          success: false,
          error: "Invalid LinkedIn profile URL",
        };
      }

      const profile = await this.request<LinkedInProfile>(`/users/${profileId}`, {
        method: "GET",
        headers: {
          "X-Account-Id": accountId,
        },
      });

      return { success: true, profile };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Send a LinkedIn connection request with optional note.
   * Resolves vanity usernames to provider_id via getLinkedInUserProfile
   * before calling POST /users/invite.
   */
  async sendLinkedInConnectionRequest(
    accountId: string,
    profileUrl: string,
    message?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const profileId = this.extractLinkedInProfileId(profileUrl);
      if (!profileId) {
        return {
          success: false,
          error: "Invalid LinkedIn profile URL",
        };
      }

      // Unipile's /users/invite requires the internal provider_id (e.g. ACoAAA...).
      // If we extracted a vanity username, resolve it first.
      let providerId = profileId;
      const isVanityUsername = !profileId.startsWith("ACo") && !profileId.startsWith("ADo") &&
                               !profileId.startsWith("ACw") && !profileId.startsWith("AE");
      if (isVanityUsername) {
        const profileResult = await this.getLinkedInUserProfile(accountId, profileId);
        if (!profileResult.success || !profileResult.providerId) {
          return {
            success: false,
            error: profileResult.error || `Impossible de résoudre le profil LinkedIn : ${profileId}`,
          };
        }
        providerId = profileResult.providerId;
      }

      const body: Record<string, unknown> = {
        account_id: accountId,
        provider_id: providerId,
      };

      if (message) {
        body.message = message;
      }

      await this.request("/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Extract LinkedIn profile ID from various URL formats
   * Supports: linkedin.com/in/username, linkedin.com/profile/view?id=123
   */
  private extractLinkedInProfileId(profileUrl: string): string | null {
    try {
      // Handle direct profile ID
      if (!profileUrl.includes("linkedin.com")) {
        return profileUrl; // Assume it's already a profile ID
      }

      const url = new URL(profileUrl);
      
      // Format: linkedin.com/in/username
      const inMatch = url.pathname.match(/\/in\/([^\/\?]+)/);
      if (inMatch) {
        return inMatch[1];
      }

      // Format: linkedin.com/profile/view?id=xxx
      const idParam = url.searchParams.get("id");
      if (idParam) {
        return idParam;
      }

      return null;
    } catch {
      return null;
    }
  }
}

// LinkedIn profile type
export interface LinkedInProfile {
  id: string;
  provider_id?: string;
  first_name?: string;
  last_name?: string;
  headline?: string;
  profile_url?: string;
  profile_picture_url?: string;
  location?: string;
  connections_count?: number;
}

// ============================================
// Singleton instance with default config
// ============================================

let defaultService: UnipileService | null = null;

export function getUnipileService(): UnipileService {
  if (!defaultService) {
    defaultService = new UnipileService();
  }
  return defaultService;
}
