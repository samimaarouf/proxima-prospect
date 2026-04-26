-- If in_crm was already added as NOT NULL DEFAULT false, relax the constraint.
ALTER TABLE prospect_contact
  ALTER COLUMN in_crm DROP NOT NULL,
  ALTER COLUMN in_crm SET DEFAULT null,
  ALTER COLUMN in_crm TYPE boolean USING CASE WHEN in_crm = false THEN null ELSE in_crm END;
