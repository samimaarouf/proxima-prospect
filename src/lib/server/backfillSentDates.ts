import { sql } from "drizzle-orm";
import { db } from "$lib/server/db";

/**
 * Fills `email_sent_at` / `linkedin_sent_at` / `whatsapp_sent_at` on every
 * contact of a given list from the user's existing `prospect_message_history`.
 *
 * Matching rules (same as migration 0006):
 *   - linkedin → mh.linkedin_url = contact.linkedin_url (normalised upstream)
 *   - email    → mh.recipient IN (contact.email, contact.email2)
 *
 * The earliest `sent_at` wins per (contact, channel).  Only overwrites NULL
 * values on the contact — existing user-set dates are preserved.
 *
 * IMPORTANT — we skip any (contact, channel) pair where another contact of
 * the same user (matched by LinkedIn URL or email) already owns a sent date
 * for that channel. This avoids creating duplicate "already contacted" rows
 * in the CRM when the history is held by a separate contact (e.g. the
 * "Récupération — historique" list).
 *
 * Called at the end of every import so a freshly-imported person whose email
 * / LinkedIn was previously messaged shows up in the CRM as "already
 * contacted", even when the original list was deleted.
 */
export async function backfillSentDatesForList(userId: string, listId: string) {
  const res = await db.execute(sql`
    WITH contact_owner AS (
      SELECT pc.id AS contact_id,
             pc.linkedin_url,
             pc.email,
             pc.email2
      FROM prospect_contact pc
      INNER JOIN prospect_offer po ON po.id = pc.offer_id
      WHERE po.list_id = ${listId}
    ),
    matched AS (
      SELECT co.contact_id,
             mh.channel,
             MIN(mh.sent_at) AS sent_at
      FROM contact_owner co
      INNER JOIN prospect_message_history mh
        ON mh.user_id = ${userId}
       AND (
            (co.linkedin_url IS NOT NULL AND mh.linkedin_url = co.linkedin_url)
         OR (co.email  IS NOT NULL AND mh.recipient = co.email)
         OR (co.email2 IS NOT NULL AND mh.recipient = co.email2)
       )
      GROUP BY co.contact_id, mh.channel
    ),
    filtered AS (
      SELECT m.contact_id, m.channel, m.sent_at
      FROM matched m
      INNER JOIN contact_owner co ON co.contact_id = m.contact_id
      WHERE NOT EXISTS (
        SELECT 1
        FROM prospect_contact other
        INNER JOIN prospect_offer  po2 ON po2.id = other.offer_id
        INNER JOIN prospect_list   pl2 ON pl2.id = po2.list_id
        WHERE pl2.user_id = ${userId}
          AND other.id <> m.contact_id
          AND (
               (co.linkedin_url IS NOT NULL AND other.linkedin_url = co.linkedin_url)
            OR (co.email        IS NOT NULL AND other.email        = co.email)
            OR (co.email        IS NOT NULL AND other.email2       = co.email)
            OR (co.email2       IS NOT NULL AND other.email        = co.email2)
            OR (co.email2       IS NOT NULL AND other.email2       = co.email2)
          )
          AND (
               (m.channel = 'email'    AND other.email_sent_at     IS NOT NULL)
            OR (m.channel = 'linkedin' AND other.linkedin_sent_at  IS NOT NULL)
            OR (m.channel = 'whatsapp' AND other.whatsapp_sent_at  IS NOT NULL)
          )
      )
    )
    UPDATE prospect_contact pc
    SET
      email_sent_at = COALESCE(
        pc.email_sent_at,
        (SELECT sent_at FROM filtered m WHERE m.contact_id = pc.id AND m.channel = 'email')
      ),
      linkedin_sent_at = COALESCE(
        pc.linkedin_sent_at,
        (SELECT sent_at FROM filtered m WHERE m.contact_id = pc.id AND m.channel = 'linkedin')
      ),
      whatsapp_sent_at = COALESCE(
        pc.whatsapp_sent_at,
        (SELECT sent_at FROM filtered m WHERE m.contact_id = pc.id AND m.channel = 'whatsapp')
      )
    WHERE EXISTS (SELECT 1 FROM filtered m WHERE m.contact_id = pc.id)
      AND (
        pc.email_sent_at    IS NULL
     OR pc.linkedin_sent_at IS NULL
     OR pc.whatsapp_sent_at IS NULL
      );
  `);
  // Drivers return different shapes here (`rowCount` / `affectedRows` / …).
  // We surface whatever they expose so callers can log/report it.
  return {
    updated:
      (res as { rowCount?: number }).rowCount ??
      (res as { affectedRows?: number }).affectedRows ??
      0,
  };
}
