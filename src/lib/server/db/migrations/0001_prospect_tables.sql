-- Create prospect tables for proxima-prospect app

CREATE TABLE IF NOT EXISTS "prospect_list" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "pitch" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "prospect_list_user_id_idx" ON "prospect_list" ("user_id");

CREATE TABLE IF NOT EXISTS "prospect_offer" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "list_id" uuid NOT NULL REFERENCES "prospect_list"("id") ON DELETE CASCADE,
  "company_name" text NOT NULL,
  "offer_url" text,
  "offer_content" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "prospect_offer_list_id_idx" ON "prospect_offer" ("list_id");

CREATE TABLE IF NOT EXISTS "prospect_contact" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "offer_id" uuid NOT NULL REFERENCES "prospect_offer"("id") ON DELETE CASCADE,
  "linkedin_url" text,
  "phone1" text,
  "phone2" text,
  "email" text,
  "last_contact_date" text,
  "touch_count" text,
  "last_action" text,
  "next_step" text,
  "notes" text,
  "full_name" text,
  "job_title" text,
  "linkedin_data" jsonb,
  "linkedin_summary" text,
  "ai_message" text,
  "contact_status" text DEFAULT 'to_contact',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "prospect_contact_offer_id_idx" ON "prospect_contact" ("offer_id");
