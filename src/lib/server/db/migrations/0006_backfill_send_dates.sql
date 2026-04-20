-- Backfill per-channel "sent at" dates from existing prospect_message_history rows.
-- Joins on linkedin_url when available, else on recipient = contact email,
-- and scopes by user via offer -> list -> user_id.
-- Picks the earliest sent_at per (contact, channel).

-- Helper CTE: resolve the user_id that owns each contact.
WITH contact_owner AS (
  SELECT pc.id AS contact_id,
         pc.linkedin_url,
         pc.email,
         pl.user_id
  FROM prospect_contact pc
  INNER JOIN prospect_offer po ON po.id = pc.offer_id
  INNER JOIN prospect_list pl  ON pl.id = po.list_id
),
-- Earliest sent_at per (contact, channel)
matched AS (
  SELECT co.contact_id,
         mh.channel,
         MIN(mh.sent_at) AS sent_at
  FROM contact_owner co
  INNER JOIN prospect_message_history mh
    ON mh.user_id = co.user_id
   AND (
        (co.linkedin_url IS NOT NULL AND mh.linkedin_url = co.linkedin_url)
     OR (co.email IS NOT NULL AND mh.recipient = co.email)
   )
  GROUP BY co.contact_id, mh.channel
)
UPDATE prospect_contact pc
SET
  email_sent_at = COALESCE(
    pc.email_sent_at,
    (SELECT sent_at FROM matched m WHERE m.contact_id = pc.id AND m.channel = 'email')
  ),
  linkedin_sent_at = COALESCE(
    pc.linkedin_sent_at,
    (SELECT sent_at FROM matched m WHERE m.contact_id = pc.id AND m.channel = 'linkedin')
  ),
  whatsapp_sent_at = COALESCE(
    pc.whatsapp_sent_at,
    (SELECT sent_at FROM matched m WHERE m.contact_id = pc.id AND m.channel = 'whatsapp')
  )
WHERE EXISTS (
  SELECT 1 FROM matched m WHERE m.contact_id = pc.id
);
