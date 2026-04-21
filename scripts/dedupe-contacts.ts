/**
 * Merges prospect_contact duplicates within each list.
 *
 * Two contacts are considered duplicates when their LinkedIn URL normalises
 * to the same canonical form (see `src/lib/linkedinUrl.ts`).  Typical cause:
 * one CEO referenced by several offers of the same company in an import.
 *
 * For every duplicate group inside a list we:
 *   1. Pick the keeper — the oldest `created_at` (stable tie-breaker: id).
 *   2. Fill any NULL column on the keeper with the first non-null value we
 *      find among the duplicates (email, phones, fullName, jobTitle,
 *      linkedinData, aiMessage, …).
 *   3. Keep the earliest non-null `*SentAt` date (we never want to look like
 *      we haven't contacted someone we already did).
 *   4. Canonicalise the keeper's `linkedin_url` to the normalised form.
 *   5. Delete the other contacts.
 *
 * Run `npx tsx scripts/dedupe-contacts.ts [userEmail]` for a dry-run.
 * Add `--commit` to actually apply the changes (wraps everything in one
 * transaction, rolled back on error).  Omit `userEmail` to process every
 * user in the database.
 */
import { Pool } from "pg";
import { config } from "dotenv";
import { normalizeLinkedInUrl } from "../src/lib/linkedinUrl";

config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL manquante");

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit");
const userEmail = args.find((a) => !a.startsWith("--"));

const pool = new Pool({ connectionString: DATABASE_URL });

/**
 * Columns that carry user-visible data on `prospect_contact`.  Order matters
 * only for readability in the dry-run report.  Every column listed here is
 * merged via COALESCE from duplicates into the keeper.
 */
const MERGE_COLUMNS = [
  "phone1",
  "phone2",
  "email",
  "email2",
  "last_contact_date",
  "touch_count",
  "last_action",
  "next_step",
  "notes",
  "full_name",
  "job_title",
  "linkedin_data",
  "linkedin_summary",
  "ai_message",
  "ai_message_linkedin",
  "contact_status",
] as const;

/** Timestamp columns where we keep the EARLIEST non-null value. */
const MIN_TIMESTAMP_COLUMNS = [
  "email_sent_at",
  "linkedin_sent_at",
  "whatsapp_sent_at",
  "called_at",
  "next_step_at",
] as const;

type ContactRow = {
  id: string;
  offer_id: string;
  list_id: string;
  list_name: string;
  linkedin_url: string | null;
  created_at: Date;
  contact_status: string | null;
} & Record<(typeof MERGE_COLUMNS)[number], string | null> &
  Record<(typeof MIN_TIMESTAMP_COLUMNS)[number], Date | null>;

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
  let totalGroups = 0;
  let totalMerged = 0;
  let totalDeleted = 0;

  try {
    if (COMMIT) await client.query("BEGIN");

    for (const u of users.rows) {
      const { rows: contacts } = await client.query<ContactRow>(
        `SELECT
           pc.id,
           pc.offer_id,
           po.list_id,
           pl.name       AS list_name,
           pc.linkedin_url,
           pc.created_at,
           pc.phone1, pc.phone2,
           pc.email, pc.email2,
           pc.last_contact_date, pc.touch_count, pc.last_action,
           pc.next_step, pc.notes,
           pc.full_name, pc.job_title,
           pc.linkedin_data, pc.linkedin_summary,
           pc.ai_message, pc.ai_message_linkedin,
           pc.contact_status,
           pc.email_sent_at, pc.linkedin_sent_at, pc.whatsapp_sent_at,
           pc.called_at, pc.next_step_at
         FROM prospect_contact pc
         INNER JOIN prospect_offer po ON po.id = pc.offer_id
         INNER JOIN prospect_list  pl ON pl.id = po.list_id
         WHERE pl.user_id = $1
         ORDER BY po.list_id, pc.created_at ASC`,
        [u.id],
      );

      // Bucket by (list_id, normalized linkedin url).  Contacts without a
      // LinkedIn URL are never merged — we have no reliable identity key.
      const groups = new Map<string, ContactRow[]>();
      for (const c of contacts) {
        const canonical = normalizeLinkedInUrl(c.linkedin_url);
        if (!canonical) continue;
        const key = `${c.list_id}::${canonical}`;
        const bucket = groups.get(key) ?? [];
        bucket.push(c);
        groups.set(key, bucket);
      }

      const dupeGroups = [...groups.entries()].filter(([, arr]) => arr.length > 1);
      if (dupeGroups.length === 0) continue;

      console.log(`\n=== ${u.email} — ${dupeGroups.length} groupe(s) de doublons ===`);

      for (const [key, group] of dupeGroups) {
        const canonical = key.split("::")[1];
        // Oldest wins; ids disambiguate perfectly predictable ties.
        group.sort((a, b) => {
          const d = a.created_at.getTime() - b.created_at.getTime();
          return d !== 0 ? d : a.id.localeCompare(b.id);
        });
        const [keeper, ...dupes] = group;

        // Compute the patch: first non-null value across dupes for merge cols,
        // min date across all for timestamp cols.
        const patch: Record<string, unknown> = {};
        for (const col of MERGE_COLUMNS) {
          if (keeper[col] != null && keeper[col] !== "") continue;
          const hit = dupes.find((d) => d[col] != null && d[col] !== "");
          if (hit) patch[col] = hit[col];
        }
        for (const col of MIN_TIMESTAMP_COLUMNS) {
          const all = [keeper[col], ...dupes.map((d) => d[col])].filter(
            (v): v is Date => v != null,
          );
          if (!all.length) continue;
          const earliest = all.reduce((a, b) => (a.getTime() <= b.getTime() ? a : b));
          if (!keeper[col] || keeper[col]!.getTime() !== earliest.getTime()) {
            patch[col] = earliest;
          }
        }
        // Always canonicalise the LinkedIn URL on the keeper.
        if (keeper.linkedin_url !== canonical) patch.linkedin_url = canonical;

        totalGroups += 1;
        totalMerged += 1;
        totalDeleted += dupes.length;

        const summary = Object.keys(patch).length
          ? `+ merge: ${Object.keys(patch).join(", ")}`
          : "(rien à merger)";
        console.log(
          `  [${group[0].list_name}] ${canonical}: keeper=${keeper.id.slice(0, 8)} ` +
            `drop=${dupes.length} ${summary}`,
        );

        if (!COMMIT) continue;

        if (Object.keys(patch).length) {
          const setFrags = Object.keys(patch).map((c, i) => `${c} = $${i + 2}`);
          await client.query(
            `UPDATE prospect_contact SET ${setFrags.join(", ")}, updated_at = NOW() WHERE id = $1`,
            [keeper.id, ...Object.values(patch)],
          );
        }

        await client.query(
          `DELETE FROM prospect_contact WHERE id = ANY($1::uuid[])`,
          [dupes.map((d) => d.id)],
        );
      }
    }

    if (COMMIT) {
      await client.query("COMMIT");
      console.log(
        `\n✓ Commit OK — ${totalGroups} groupe(s), ${totalMerged} contact(s) fusionné(s), ${totalDeleted} contact(s) supprimé(s).`,
      );
    } else {
      console.log(
        `\n[dry-run] ${totalGroups} groupe(s), ${totalMerged} fusion(s) potentielle(s), ${totalDeleted} suppression(s) potentielle(s).`,
      );
      console.log(`  → relance avec --commit pour appliquer.`);
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
