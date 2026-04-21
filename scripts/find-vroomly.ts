/**
 * Quick diagnostic: where does "Vroomly" live for a given user?
 * Usage: npx tsx scripts/find-vroomly.ts <userEmail> [companyQuery]
 */
import { Pool } from "pg";
import { config } from "dotenv";

config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL manquante");

const [, , userEmail, rawQuery] = process.argv;
if (!userEmail) {
  console.error("Usage: npx tsx scripts/find-vroomly.ts <userEmail> [companyQuery]");
  process.exit(1);
}
const query = (rawQuery || "vroomly").toLowerCase();

const pool = new Pool({ connectionString: DATABASE_URL });

async function main() {
  const { rows: users } = await pool.query<{ id: string }>(
    `SELECT id FROM "user" WHERE email = $1`,
    [userEmail],
  );
  if (!users.length) {
    console.error("User not found");
    return;
  }
  const userId = users[0].id;

  console.log(`\n=== Recherche "${query}" pour ${userEmail} ===\n`);

  console.log("--- prospect_message_history ---");
  const { rows: msgs } = await pool.query(
    `SELECT id, channel, company_name, offer_title, contact_name, linkedin_url, recipient, sent_at
     FROM prospect_message_history
     WHERE user_id = $1
       AND (LOWER(company_name) LIKE '%' || $2 || '%'
            OR LOWER(offer_title) LIKE '%' || $2 || '%'
            OR LOWER(contact_name) LIKE '%' || $2 || '%'
            OR LOWER(COALESCE(linkedin_url, '')) LIKE '%' || $2 || '%'
            OR LOWER(COALESCE(recipient, '')) LIKE '%' || $2 || '%')
     ORDER BY sent_at DESC`,
    [userId, query],
  );
  for (const m of msgs) {
    console.log(
      `  [${m.channel}] ${m.company_name || "?"} · ${m.offer_title || ""} → ${m.contact_name || "?"} <${m.recipient || m.linkedin_url}> @${new Date(m.sent_at).toLocaleString("fr-FR")}`,
    );
  }
  if (!msgs.length) console.log("  (rien)");

  console.log("\n--- prospect_offer (toutes listes du user) ---");
  const { rows: offers } = await pool.query(
    `SELECT po.id, po.company_name, po.offer_title, po.disabled_at,
            pl.id AS list_id, pl.name AS list_name
     FROM prospect_offer po
     INNER JOIN prospect_list pl ON pl.id = po.list_id
     WHERE pl.user_id = $1
       AND (LOWER(po.company_name) LIKE '%' || $2 || '%'
            OR LOWER(COALESCE(po.offer_title, '')) LIKE '%' || $2 || '%')
     ORDER BY po.created_at DESC`,
    [userId, query],
  );
  for (const o of offers) {
    console.log(
      `  offer ${o.id} · ${o.company_name} / ${o.offer_title || "(no title)"} → list "${o.list_name}" (${o.list_id})${o.disabled_at ? " [DISABLED]" : ""}`,
    );
  }
  if (!offers.length) console.log("  (rien)");

  console.log("\n--- prospect_contact (via offres du user) ---");
  const { rows: contacts } = await pool.query(
    `SELECT pc.id, pc.full_name, pc.linkedin_url, pc.email, pc.email2,
            pc.email_sent_at, pc.linkedin_sent_at,
            po.company_name, po.offer_title, po.disabled_at,
            pl.name AS list_name
     FROM prospect_contact pc
     INNER JOIN prospect_offer po ON po.id = pc.offer_id
     INNER JOIN prospect_list pl ON pl.id = po.list_id
     WHERE pl.user_id = $1
       AND (LOWER(po.company_name) LIKE '%' || $2 || '%'
            OR LOWER(COALESCE(pc.full_name, '')) LIKE '%' || $2 || '%'
            OR LOWER(COALESCE(pc.linkedin_url, '')) LIKE '%' || $2 || '%'
            OR LOWER(COALESCE(pc.email, '')) LIKE '%' || $2 || '%'
            OR LOWER(COALESCE(pc.email2, '')) LIKE '%' || $2 || '%')
     ORDER BY pc.created_at DESC`,
    [userId, query],
  );
  for (const c of contacts) {
    console.log(
      `  contact ${c.id} · ${c.full_name} <${c.email || c.linkedin_url}> → ${c.company_name} / ${c.offer_title || ""} (list "${c.list_name}"${c.disabled_at ? ", DISABLED" : ""}) emailSentAt=${c.email_sent_at ? new Date(c.email_sent_at).toLocaleString("fr-FR") : "null"}`,
    );
  }
  if (!contacts.length) console.log("  (rien)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pool.end());
