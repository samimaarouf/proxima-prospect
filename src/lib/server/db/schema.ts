import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ===========================
// Better Auth required tables (shared DB with proxima-v3)
// We reference the same tables but only need types for auth here.
// Better Auth will find these automatically via drizzleAdapter.
// ===========================
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false),
  name: text("name"),
  company: text("company").notNull().default("proxima"),
  image: text("image"),
  role: text("role").notNull().default("user"),
  coresignalApiKey: text("coresignal_api_key"),
  greenApiInstance: text("green_api_instance"),
  greenApiToken: text("green_api_token"),
  fullenrichApiKey: text("fullenrich_api_key"),
  firefliesApiKey: text("fireflies_api_key"),
  gmailEmail: text("gmail_email"),
  gmailAccessToken: text("gmail_access_token"),
  gmailRefreshToken: text("gmail_refresh_token"),
  gmailTokenExpiry: timestamp("gmail_token_expiry"),
  unipileAccountId: text("unipile_account_id"),
  unipileWhatsAppAccountId: text("unipile_whatsapp_account_id"),
  unipileLinkedInAccountId: text("unipile_linkedin_account_id"),
  unipileDsn: text("unipile_dsn"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ===========================
// Proxima-Prospect specific tables
// ===========================

export const prospectList = pgTable("prospect_list", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  pitch: text("pitch"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("prospect_list_user_id_idx").on(table.userId),
}));

export const prospectOffer = pgTable("prospect_offer", {
  id: uuid("id").primaryKey().defaultRandom(),
  listId: uuid("list_id").notNull().references(() => prospectList.id, { onDelete: "cascade" }),
  companyName: text("company_name").notNull(),
  offerTitle: text("offer_title"),
  offerUrl: text("offer_url"),
  offerLocation: text("offer_location"),
  offerContent: text("offer_content"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  listIdIdx: index("prospect_offer_list_id_idx").on(table.listId),
}));

export const prospectContact = pgTable("prospect_contact", {
  id: uuid("id").primaryKey().defaultRandom(),
  offerId: uuid("offer_id").notNull().references(() => prospectOffer.id, { onDelete: "cascade" }),
  linkedinUrl: text("linkedin_url"),
  phone1: text("phone1"),
  phone2: text("phone2"),
  email: text("email"),
  email2: text("email2"),
  lastContactDate: text("last_contact_date"),
  touchCount: text("touch_count"),
  lastAction: text("last_action"),
  nextStep: text("next_step"),
  notes: text("notes"),
  // Enriched LinkedIn data
  fullName: text("full_name"),
  jobTitle: text("job_title"),
  linkedinData: jsonb("linkedin_data"),
  linkedinSummary: text("linkedin_summary"),
  aiMessage: text("ai_message"),
  /** Invitation LinkedIn (< 300 car.) — distinct de WhatsApp / email (`aiMessage`) */
  aiMessageLinkedin: text("ai_message_linkedin"),
  // Status
  contactStatus: text("contact_status").default("to_contact"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  offerIdIdx: index("prospect_contact_offer_id_idx").on(table.offerId),
}));

export const messageHistory = pgTable("prospect_message_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  linkedinUrl: text("linkedin_url"),
  contactName: text("contact_name"),
  offerTitle: text("offer_title"),
  companyName: text("company_name"),
  channel: text("channel").notNull(),
  recipient: text("recipient"),
  message: text("message").notNull(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("message_history_user_id_idx").on(table.userId),
  linkedinUrlIdx: index("message_history_linkedin_url_idx").on(table.linkedinUrl),
}));

// ===========================
// Relations
// ===========================

export const prospectListRelations = relations(prospectList, ({ many }) => ({
  offers: many(prospectOffer),
}));

export const prospectOfferRelations = relations(prospectOffer, ({ one, many }) => ({
  list: one(prospectList, { fields: [prospectOffer.listId], references: [prospectList.id] }),
  contacts: many(prospectContact),
}));

export const prospectContactRelations = relations(prospectContact, ({ one }) => ({
  offer: one(prospectOffer, { fields: [prospectContact.offerId], references: [prospectOffer.id] }),
}));
