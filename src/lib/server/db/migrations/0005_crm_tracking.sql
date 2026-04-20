-- CRM tracking: per-channel send dates + next step date + new status semantics

ALTER TABLE "prospect_contact"
  ADD COLUMN IF NOT EXISTS "email_sent_at" timestamp,
  ADD COLUMN IF NOT EXISTS "linkedin_sent_at" timestamp,
  ADD COLUMN IF NOT EXISTS "whatsapp_sent_at" timestamp,
  ADD COLUMN IF NOT EXISTS "called_at" timestamp,
  ADD COLUMN IF NOT EXISTS "next_step_at" timestamp;

-- Switch default to 'undefined' (Non défini)
ALTER TABLE "prospect_contact"
  ALTER COLUMN "contact_status" SET DEFAULT 'undefined';

-- Migrate legacy statuses (and the dropped 'waiting'/'not_interested') to 'undefined'.
-- Keep 'closed', 'no_answer', 'interested' as-is.
UPDATE "prospect_contact"
SET "contact_status" = 'undefined'
WHERE "contact_status" IN ('to_contact', 'contacted', 'replied', 'waiting', 'not_interested')
   OR "contact_status" LIKE 'contacted_%';

CREATE INDEX IF NOT EXISTS "prospect_contact_email_sent_at_idx"
  ON "prospect_contact" ("email_sent_at");

CREATE INDEX IF NOT EXISTS "prospect_contact_next_step_at_idx"
  ON "prospect_contact" ("next_step_at");
