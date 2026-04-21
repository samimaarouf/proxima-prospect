import { Pool } from "pg";
import { config } from "dotenv";

config();

const argv = process.argv.slice(2);
const COMMIT = argv.includes("--commit");
const USER_EMAIL = argv.find((a) => !a.startsWith("--")) ?? "sami@maarouf.pro";
const RECOVERY_LIST_NAME = "Récupération — historique";

/**
 * Reset `*SentAt` on active-list contacts when the same person already owns
 * the history in the recovery list.
 *
 * Matching key per contact: normalized LinkedIn URL (if present), otherwise
 * lower-cased email, otherwise lower-cased email2. We only reset channels
 * where the recovery contact actually holds a sent date, so partial overlaps
 * (e.g. recovery has email but not LinkedIn) still keep the non-conflicting
 * channel on the active side.
 */

function normLinkedin(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (!/linkedin\.com$/i.test(u.hostname) && !/linkedin\.com$/i.test(u.hostname.replace(/^[a-z]+\./, ""))) return null;
    const m = u.pathname.match(/^\/(in|pub|company)\/([^/?#]+)/i);
    if (!m) return null;
    return `https://www.linkedin.com/${m[1].toLowerCase()}/${decodeURIComponent(m[2]).toLowerCase()}`;
  } catch {
    return null;
  }
}

function keyOf(c: { linkedin_url: string | null; email: string | null; email2: string | null }): string | null {
  const li = normLinkedin(c.linkedin_url);
  if (li) return `li:${li}`;
  if (c.email) return `em:${c.email.trim().toLowerCase()}`;
  if (c.email2) return `em:${c.email2.trim().toLowerCase()}`;
  return null;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    const user = await client.query<{ id: string }>(`SELECT id FROM "user" WHERE email = $1`, [USER_EMAIL]);
    if (!user.rows[0]) throw new Error(`User ${USER_EMAIL} not found`);
    const userId = user.rows[0].id;

    const recoveryList = await client.query<{ id: string }>(
      `SELECT pl.id FROM prospect_list pl WHERE pl.user_id = $1 AND pl.name = $2 LIMIT 1`,
      [userId, RECOVERY_LIST_NAME],
    );
    if (!recoveryList.rows[0]) {
      console.log(`No recovery list "${RECOVERY_LIST_NAME}" for ${USER_EMAIL}.`);
      return;
    }
    const recoveryListId = recoveryList.rows[0].id;

    const { rows: allContacts } = await client.query<{
      id: string;
      list_id: string;
      list_name: string;
      offer_id: string;
      company_name: string;
      full_name: string | null;
      linkedin_url: string | null;
      email: string | null;
      email2: string | null;
      email_sent_at: Date | null;
      linkedin_sent_at: Date | null;
      whatsapp_sent_at: Date | null;
    }>(
      `SELECT pc.id, pl.id AS list_id, pl.name AS list_name,
              po.id AS offer_id, po.company_name, pc.full_name,
              pc.linkedin_url, pc.email, pc.email2,
              pc.email_sent_at, pc.linkedin_sent_at, pc.whatsapp_sent_at
       FROM prospect_contact pc
       INNER JOIN prospect_offer po ON po.id = pc.offer_id
       INNER JOIN prospect_list  pl ON pl.id = po.list_id
       WHERE pl.user_id = $1`,
      [userId],
    );

    type RecoveryRecord = {
      emailSentAt: Date | null;
      linkedinSentAt: Date | null;
      whatsappSentAt: Date | null;
    };
    const recoveryByKey = new Map<string, RecoveryRecord>();
    for (const c of allContacts) {
      if (c.list_id !== recoveryListId) continue;
      const k = keyOf(c);
      if (!k) continue;
      const existing = recoveryByKey.get(k);
      if (!existing) {
        recoveryByKey.set(k, {
          emailSentAt: c.email_sent_at,
          linkedinSentAt: c.linkedin_sent_at,
          whatsappSentAt: c.whatsapp_sent_at,
        });
      } else {
        recoveryByKey.set(k, {
          emailSentAt: existing.emailSentAt ?? c.email_sent_at,
          linkedinSentAt: existing.linkedinSentAt ?? c.linkedin_sent_at,
          whatsappSentAt: existing.whatsappSentAt ?? c.whatsapp_sent_at,
        });
      }
    }

    type Plan = {
      id: string;
      fullName: string | null;
      listName: string;
      companyName: string;
      resetEmail: boolean;
      resetLinkedin: boolean;
      resetWhatsapp: boolean;
    };
    const plans: Plan[] = [];

    for (const c of allContacts) {
      if (c.list_id === recoveryListId) continue;
      const k = keyOf(c);
      if (!k) continue;
      const rec = recoveryByKey.get(k);
      if (!rec) continue;

      const resetEmail = !!(rec.emailSentAt && c.email_sent_at);
      const resetLinkedin = !!(rec.linkedinSentAt && c.linkedin_sent_at);
      const resetWhatsapp = !!(rec.whatsappSentAt && c.whatsapp_sent_at);
      if (!resetEmail && !resetLinkedin && !resetWhatsapp) continue;
      plans.push({
        id: c.id,
        fullName: c.full_name,
        listName: c.list_name,
        companyName: c.company_name,
        resetEmail,
        resetLinkedin,
        resetWhatsapp,
      });
    }

    if (plans.length === 0) {
      console.log("Nothing to do — no active-list contact overlaps the recovery list on any channel.");
      return;
    }

    console.log(`Will reset ${plans.length} contact(s):`);
    for (const p of plans) {
      const channels = [
        p.resetEmail ? "email" : null,
        p.resetLinkedin ? "linkedin" : null,
        p.resetWhatsapp ? "whatsapp" : null,
      ]
        .filter(Boolean)
        .join(", ");
      console.log(`  · ${p.fullName ?? "(no name)"} — ${p.companyName} [${p.listName}] → reset ${channels}`);
    }

    if (!COMMIT) {
      console.log("\n(dry-run) add --commit to apply.");
      return;
    }

    await client.query("BEGIN");
    for (const p of plans) {
      const sets: string[] = [];
      if (p.resetEmail) sets.push(`email_sent_at = NULL`);
      if (p.resetLinkedin) sets.push(`linkedin_sent_at = NULL`);
      if (p.resetWhatsapp) sets.push(`whatsapp_sent_at = NULL`);
      await client.query(`UPDATE prospect_contact SET ${sets.join(", ")} WHERE id = $1`, [p.id]);
    }
    await client.query("COMMIT");
    console.log(`\n✓ Commit OK — ${plans.length} contact(s) updated.`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
