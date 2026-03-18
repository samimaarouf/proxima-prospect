CREATE TABLE IF NOT EXISTS "prospect_message_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "linkedin_url" text,
  "contact_name" text,
  "offer_title" text,
  "company_name" text,
  "channel" text NOT NULL,
  "recipient" text,
  "message" text NOT NULL,
  "sent_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "prospect_message_history_user_id_idx" ON "prospect_message_history" ("user_id");
CREATE INDEX IF NOT EXISTS "prospect_message_history_linkedin_url_idx" ON "prospect_message_history" ("linkedin_url");
