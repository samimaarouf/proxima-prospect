/**
 * One-shot: re-run the message_history → prospect_contact backfill.
 *
 * Use this after a large import / LinkedIn URL normalisation / contact CSV
 * enrichment to make sure every contact whose email or LinkedIn matches a
 * past outreach shows up as "déjà contacté" in the CRM.
 *
 * Run: `npx tsx scripts/backfill-sent-dates.ts [userEmail]` (dry-run shows
 * how many rows would be touched per list; add `--commit` to apply).
 */
import { Pool } from "pg";
import { config } from "dotenv";

config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL manquante");

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit");
const userEmail = args.find((a) => !a.startsWith("--"));

const pool = new Pool({ connectionString: DATABASE_URL });

async function main() {
  const users = userEmail
    ? await pool.query<{ id: string; email: string }>(
        `SELECT id, email FROM "user" WHERE email = $1`,
        [userEmail],
      )
    : await pool.query<{ id: string; email: string }>(
        `SELECT id, email FROM "user" ORDER BY created_at DESC`,
      );

  if (!users.rows.length) {
    console.log("Aucun utilisateur trouvé.");
    return;
  }

  const client = await pool.connect();
  try {
    if (COMMIT) await client.query("BEGIN");

    for (const u of users.rows) {
      const lists = await client.query<{ id: string; name: string }>(
        `SELECT id, name FROM prospect_list WHERE user_id = $1 ORDER BY created_at`,
        [u.id],
      );
      if (!lists.rows.length) continue;
      console.log(`\n=== ${u.email} — ${lists.rows.length} liste(s) ===`);

      for (const l of lists.rows) {
        // Count what would be changed (dry-run friendly).
        const { rows: preview } = await client.query<{
          to_update: number;
          email_hits: number;
          linkedin_hits: number;
          whatsapp_hits: number;
        }>(
          `WITH contact_owner AS (
             SELECT pc.id AS contact_id,
                    pc.linkedin_url,
                    pc.email,
                    pc.email2,
                    pc.email_sent_at,
                    pc.linkedin_sent_at,
                    pc.whatsapp_sent_at
             FROM prospect_contact pc
             INNER JOIN prospect_offer po ON po.id = pc.offer_id
             WHERE po.list_id = $2
           ),
           matched AS (
             SELECT co.contact_id, mh.channel, MIN(mh.sent_at) AS sent_at,
                    co.email_sent_at, co.linkedin_sent_at, co.whatsapp_sent_at
             FROM contact_owner co
             INNER JOIN prospect_message_history mh
               ON mh.user_id = $1
              AND (
                   (co.linkedin_url IS NOT NULL AND mh.linkedin_url = co.linkedin_url)
                OR (co.email  IS NOT NULL AND mh.recipient = co.email)
                OR (co.email2 IS NOT NULL AND mh.recipient = co.email2)
              )
             GROUP BY co.contact_id, mh.channel,
                      co.email_sent_at, co.linkedin_sent_at, co.whatsapp_sent_at
           )
           SELECT
             COUNT(DISTINCT contact_id)::int AS to_update,
             COUNT(*) FILTER (WHERE channel = 'email'    AND email_sent_at    IS NULL)::int AS email_hits,
             COUNT(*) FILTER (WHERE channel = 'linkedin' AND linkedin_sent_at IS NULL)::int AS linkedin_hits,
             COUNT(*) FILTER (WHERE channel = 'whatsapp' AND whatsapp_sent_at IS NULL)::int AS whatsapp_hits
           FROM matched`,
          [u.id, l.id],
        );
        const p = preview[0];
        if (!p.to_update) continue;
        console.log(
          `  [${l.name}] ${p.to_update} contact(s) touché(s) — ` +
            `email:+${p.email_hits} linkedin:+${p.linkedin_hits} whatsapp:+${p.whatsapp_hits}`,
        );

        if (!COMMIT) continue;

        await client.query(
          `WITH contact_owner AS (
             SELECT pc.id AS contact_id, pc.linkedin_url, pc.email, pc.email2
             FROM prospect_contact pc
             INNER JOIN prospect_offer po ON po.id = pc.offer_id
             WHERE po.list_id = $2
           ),
           matched AS (
             SELECT co.contact_id, mh.channel, MIN(mh.sent_at) AS sent_at
             FROM contact_owner co
             INNER JOIN prospect_message_history mh
               ON mh.user_id = $1
              AND (
                   (co.linkedin_url IS NOT NULL AND mh.linkedin_url = co.linkedin_url)
                OR (co.email  IS NOT NULL AND mh.recipient = co.email)
                OR (co.email2 IS NOT NULL AND mh.recipient = co.email2)
              )
             GROUP BY co.contact_id, mh.channel
           )
           UPDATE prospect_contact pc
           SET
             email_sent_at    = COALESCE(pc.email_sent_at,    (SELECT sent_at FROM matched m WHERE m.contact_id = pc.id AND m.channel = 'email')),
             linkedin_sent_at = COALESCE(pc.linkedin_sent_at, (SELECT sent_at FROM matched m WHERE m.contact_id = pc.id AND m.channel = 'linkedin')),
             whatsapp_sent_at = COALESCE(pc.whatsapp_sent_at, (SELECT sent_at FROM matched m WHERE m.contact_id = pc.id AND m.channel = 'whatsapp')),
             updated_at = NOW()
           WHERE EXISTS (SELECT 1 FROM matched m WHERE m.contact_id = pc.id)`,
          [u.id, l.id],
        );
      }
    }

    if (COMMIT) {
      await client.query("COMMIT");
      console.log("\n✓ Commit OK.");
    } else {
      console.log("\n[dry-run] → relance avec --commit pour appliquer.");
    }
  } catch (e) {
    if (COMMIT) await client.query("ROLLBACK");
    console.error("Erreur, ROLLBACK :", e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
