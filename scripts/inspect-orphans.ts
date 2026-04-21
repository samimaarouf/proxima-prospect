/**
 * Lists every prospect_message_history row that no longer has a matching
 * contact in prospect_contact (i.e. orphaned by a list deletion).
 *
 * Run: npx tsx scripts/inspect-orphans.ts [userEmail]
 */
import { Pool } from "pg";
import { config } from "dotenv";

config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL manquante");

const pool = new Pool({ connectionString: DATABASE_URL });

const userEmail = process.argv[2];

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

  for (const u of users.rows) {
    const { rows: orphans } = await pool.query(
      `SELECT
         mh.channel,
         COALESCE(mh.linkedin_url, mh.recipient) AS contact_key,
         mh.company_name,
         mh.offer_title,
         COUNT(*)::int AS messages_sent,
         MIN(mh.sent_at) AS first_sent,
         MAX(mh.sent_at) AS last_sent
       FROM prospect_message_history mh
       WHERE mh.user_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM prospect_contact pc
           INNER JOIN prospect_offer po ON po.id = pc.offer_id
           INNER JOIN prospect_list pl ON pl.id = po.list_id
           WHERE pl.user_id = $1
             AND (
               (mh.linkedin_url IS NOT NULL AND pc.linkedin_url = mh.linkedin_url)
               OR (mh.recipient IS NOT NULL AND (pc.email = mh.recipient OR pc.email2 = mh.recipient))
             )
         )
       GROUP BY mh.channel, contact_key, mh.company_name, mh.offer_title
       ORDER BY mh.company_name, mh.offer_title`,
      [u.id],
    );

    const companies = new Set<string>();
    const offers = new Set<string>();
    for (const r of orphans) {
      if (r.company_name) companies.add(r.company_name);
      if (r.offer_title || r.company_name)
        offers.add(`${r.company_name || "?"}::${r.offer_title || ""}`);
    }

    console.log(`\n=== ${u.email} (${u.id}) ===`);
    console.log(`Orphelins : ${orphans.length} ligne(s) d'historique`);
    console.log(`→ ${offers.size} offre(s) unique(s), ${companies.size} entreprise(s)`);
    console.log("\nDétail :");
    for (const r of orphans) {
      console.log(
        `  [${r.channel}] ${r.company_name || "?"} · ${r.offer_title || "(sans titre)"} → ${r.contact_key} (${r.messages_sent} msg, dernier ${new Date(r.last_sent).toLocaleDateString("fr-FR")})`,
      );
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pool.end());
