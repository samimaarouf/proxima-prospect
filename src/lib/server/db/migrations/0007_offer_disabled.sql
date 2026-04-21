-- Add a "disabledAt" column so offers can be archived (stays visible for
-- history, but hidden from the CRM and blocked for outreach) without having
-- to delete them outright.

ALTER TABLE prospect_offer ADD COLUMN IF NOT EXISTS disabled_at timestamp;
