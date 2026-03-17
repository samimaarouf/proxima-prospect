import { b as private_env } from "./shared-server.js";
class UnipileService {
  apiKey;
  dsn;
  baseUrl;
  constructor(apiKey, dsn) {
    this.apiKey = apiKey || private_env.UNIPILE_API_KEY || "";
    this.dsn = dsn || private_env.UNIPILE_DSN || "api1.unipile.com:13111";
    this.baseUrl = `https://${this.dsn}/api/v1`;
  }
  // ============================================
  // Helper Methods
  // ============================================
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      "X-API-KEY": this.apiKey,
      "Accept": "application/json",
      ...options.headers || {}
    };
    const response = await fetch(url, {
      ...options,
      headers
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Unipile API error (${response.status}):`, errorText);
      let detail = "";
      try {
        const parsed = JSON.parse(errorText);
        if (parsed.type) detail = parsed.type;
      } catch {
      }
      throw new Error(`Unipile API error: ${response.status} ${response.statusText}${detail ? ` (${detail})` : ""}`);
    }
    return response.json();
  }
  async requestFormData(endpoint, formData) {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "X-API-KEY": this.apiKey,
        "Accept": "application/json"
      },
      body: formData
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
  async listAccounts() {
    return this.request("/accounts");
  }
  /**
   * Get a specific account by ID
   */
  async getAccount(accountId) {
    return this.request(`/accounts/${accountId}`);
  }
  /**
   * Delete/disconnect an account
   */
  async deleteAccount(accountId) {
    await this.request(`/accounts/${accountId}`, { method: "DELETE" });
  }
  // ============================================
  // Email Methods
  // ============================================
  /**
   * Send an email
   */
  async sendEmail(params) {
    try {
      const isHtml = /<[a-z][\s\S]*>/i.test(params.body);
      const htmlBody = isHtml ? params.body : `<div>${params.body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</div>`;
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
      const result = await this.requestFormData("/emails", formData);
      return {
        success: true,
        emailId: result.id
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
  /**
   * List emails for an account
   */
  async listEmails(accountId, options) {
    const params = new URLSearchParams();
    params.append("account_id", accountId);
    if (options?.folder) params.append("folder", options.folder);
    if (options?.limit) params.append("limit", options.limit.toString());
    if (options?.cursor) params.append("cursor", options.cursor);
    return this.request(`/emails?${params.toString()}`);
  }
  /**
   * Get a specific email by ID
   */
  async getEmail(emailId) {
    return this.request(`/emails/${emailId}`);
  }
  /**
   * List email folders for an account
   */
  async listEmailFolders(accountId) {
    return this.request(`/emails/folders?account_id=${accountId}`);
  }
  // ============================================
  // Messaging Methods (LinkedIn, WhatsApp, etc.)
  // ============================================
  /**
   * List chats for an account
   */
  async listChats(accountId, options) {
    const params = new URLSearchParams();
    params.append("account_id", accountId);
    if (options?.limit) params.append("limit", options.limit.toString());
    if (options?.cursor) params.append("cursor", options.cursor);
    return this.request(`/chats?${params.toString()}`);
  }
  /**
   * Get messages in a chat
   */
  async getChatMessages(chatId, options) {
    const params = new URLSearchParams();
    if (options?.limit) params.append("limit", options.limit.toString());
    if (options?.cursor) params.append("cursor", options.cursor);
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request(`/chats/${chatId}/messages${query}`);
  }
  /**
   * Send a message in an existing chat
   */
  async sendMessageInChat(chatId, text) {
    try {
      const formData = new FormData();
      formData.append("text", text);
      const result = await this.requestFormData(
        `/chats/${chatId}/messages`,
        formData
      );
      return {
        success: true,
        messageId: result.id
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
  /**
   * Start a new chat with a user
   */
  async startNewChat(params) {
    try {
      const formData = new FormData();
      formData.append("account_id", params.accountId);
      formData.append("text", params.text);
      params.attendeeIds.forEach((id) => {
        formData.append("attendees_ids", id);
      });
      if (params.title) {
        formData.append("title", params.title);
      }
      const result = await this.requestFormData(
        "/chats",
        formData
      );
      return {
        success: true,
        chatId: result.chat_id,
        messageId: result.message_id
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
  // ============================================
  // Webhook Management
  // ============================================
  /**
   * Register a webhook URL for receiving events
   */
  async registerWebhook(url, events) {
    try {
      const result = await this.request("/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          events: events || ["message.received", "email.received"]
        })
      });
      return {
        success: true,
        webhookId: result.id
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
  /**
   * List registered webhooks
   */
  async listWebhooks() {
    return this.request("/webhooks");
  }
  /**
   * Delete a webhook
   */
  async deleteWebhook(webhookId) {
    await this.request(`/webhooks/${webhookId}`, { method: "DELETE" });
  }
  // ============================================
  // Hosted Auth Link
  // ============================================
  /**
   * Generate a hosted auth link for connecting accounts
   */
  async generateHostedAuthLink(params) {
    const body = {
      type: "create",
      api_url: `https://${this.dsn}`,
      providers: params.providers,
      success_redirect_url: params.successRedirectUrl,
      failure_redirect_url: params.failureRedirectUrl,
      expiresOn: params.expiresOn
    };
    if (params.notifyUrl) {
      body.notify_url = params.notifyUrl;
    }
    if (params.name) {
      body.name = params.name;
    }
    return this.request("/hosted/accounts/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }
  /**
   * Find the most recently connected account by type
   */
  async findRecentAccountByType(type) {
    try {
      const accounts = await this.listAccounts();
      const matchingAccounts = accounts.items.filter(
        (a) => a.type?.toUpperCase() === type.toUpperCase()
      );
      return matchingAccounts.length > 0 ? matchingAccounts[0] : null;
    } catch {
      return null;
    }
  }
  /**
   * Find account by identifier (email)
   */
  async findAccountByIdentifier(identifier) {
    try {
      const accounts = await this.listAccounts();
      return accounts.items.find(
        (a) => a.identifier?.toLowerCase() === identifier.toLowerCase()
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
  async getLinkedInUserProfile(accountId, publicIdentifier) {
    try {
      const profile = await this.request(
        `/users/${encodeURIComponent(publicIdentifier)}?account_id=${accountId}`
      );
      return {
        success: true,
        providerId: profile.provider_id,
        networkDistance: profile.network_distance,
        profile
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
  /**
   * Visit a LinkedIn profile (simulates a real profile view)
   * This triggers LinkedIn's "who viewed your profile" notification for the target
   */
  async visitLinkedInProfile(accountId, profileUrl) {
    try {
      const profileId = this.extractLinkedInProfileId(profileUrl);
      if (!profileId) {
        return {
          success: false,
          error: "Invalid LinkedIn profile URL"
        };
      }
      await this.request(`/users/${profileId}`, {
        method: "GET",
        headers: {
          "X-Account-Id": accountId
        }
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
  /**
   * Get LinkedIn profile information
   */
  async getLinkedInProfile(accountId, profileUrl) {
    try {
      const profileId = this.extractLinkedInProfileId(profileUrl);
      if (!profileId) {
        return {
          success: false,
          error: "Invalid LinkedIn profile URL"
        };
      }
      const profile = await this.request(`/users/${profileId}`, {
        method: "GET",
        headers: {
          "X-Account-Id": accountId
        }
      });
      return { success: true, profile };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
  /**
   * Send a LinkedIn connection request with optional note.
   * Resolves vanity usernames to provider_id via getLinkedInUserProfile
   * before calling POST /users/invite.
   */
  async sendLinkedInConnectionRequest(accountId, profileUrl, message) {
    try {
      const profileId = this.extractLinkedInProfileId(profileUrl);
      if (!profileId) {
        return {
          success: false,
          error: "Invalid LinkedIn profile URL"
        };
      }
      let providerId = profileId;
      const isVanityUsername = !profileId.startsWith("ACo") && !profileId.startsWith("ADo") && !profileId.startsWith("ACw") && !profileId.startsWith("AE");
      if (isVanityUsername) {
        const profileResult = await this.getLinkedInUserProfile(accountId, profileId);
        if (!profileResult.success || !profileResult.providerId) {
          return {
            success: false,
            error: profileResult.error || `Impossible de résoudre le profil LinkedIn : ${profileId}`
          };
        }
        providerId = profileResult.providerId;
      }
      const body = {
        account_id: accountId,
        provider_id: providerId
      };
      if (message) {
        body.message = message;
      }
      await this.request("/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
  /**
   * Extract LinkedIn profile ID from various URL formats
   * Supports: linkedin.com/in/username, linkedin.com/profile/view?id=123
   */
  extractLinkedInProfileId(profileUrl) {
    try {
      if (!profileUrl.includes("linkedin.com")) {
        return profileUrl;
      }
      const url = new URL(profileUrl);
      const inMatch = url.pathname.match(/\/in\/([^\/\?]+)/);
      if (inMatch) {
        return inMatch[1];
      }
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
export {
  UnipileService as U
};
