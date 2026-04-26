ALTER TABLE prospect_contact
  ADD COLUMN IF NOT EXISTS in_crm boolean DEFAULT null;
