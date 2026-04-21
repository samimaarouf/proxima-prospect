/**
 * Rebuilds contacts/offers from orphan prospect_message_history rows
 * (i.e. messages that were sent but whose list/offer/contact got deleted).
 *
 * Groups orphan messages per (company_name, offer_title, contact_key) and
 * materialises them into a new "Récupération — historique" list.  Each
 * recreated offer is created in "disabled" state so no new outreach goes
 * out by accident; the user can flip them back on one-by-one.
 *
 * Usage:
 *   npx tsx scripts/recover-orphans.ts <userEmail>                    # dry-run, orphans only
 *   npx tsx scripts/recover-orphans.ts <userEmail> --commit           # write orphans only
 *   npx tsx scripts/recover-orphans.ts <userEmail> --all              # dry-run, all history
 *   npx tsx scripts/recover-orphans.ts <userEmail> --all --commit     # write all history
 *
 * Flags:
 *   --commit    actually write (default: dry-run)
 *   --all       include all message history, not just orphans
 *   --disable   mark the recreated offers as disabled (default: active)
 */
import { Pool } from "pg";
import { config } from "dotenv";

config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL manquante");

const args = process.argv.slice(2);
const userEmail = args.find((a) => !a.startsWith("--"));
const COMMIT = args.includes("--commit");
const ALL = args.includes("--all");
const DISABLE = args.includes("--disable");
/**
 * When --reset-actives is passed alongside --all, clear the per-channel
 * sent_at fields on existing active contacts whose date exactly matches the
 * earliest message_history timestamp we're re-materialising in the recovery
 * list.  This avoids a given message showing up twice in the CRM (once via
 * the active re-import + once via the recovery list).
 */
const RESET_ACTIVES = args.includes("--reset-actives");
if (!userEmail) {
  console.error(
    "Usage: npx tsx scripts/recover-orphans.ts <userEmail> [--all] [--commit]",
  );
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

type OrphanRow = {
  channel: string;
  linkedin_url: string | null;
  recipient: string | null;
  contact_name: string | null;
  company_name: string | null;
  offer_title: string | null;
  message_count: number;
  last_sent: Date;
};

async function main() {
  const { rows: users } = await pool.query<{ id: string }>(
    `SELECT id FROM "user" WHERE email = $1`,
    [userEmail],
  );
  if (!users.length) {
    console.error(`Utilisateur ${userEmail} introuvable.`);
    process.exit(1);
  }
  const userId = users[0].id;

  const orphanFilter = ALL
    ? ""
    : `AND NOT EXISTS (
         SELECT 1 FROM prospect_contact pc
         INNER JOIN prospect_offer po ON po.id = pc.offer_id
         INNER JOIN prospect_list pl ON pl.id = po.list_id
         WHERE pl.user_id = $1
           AND (
             (mh.linkedin_url IS NOT NULL AND pc.linkedin_url = mh.linkedin_url)
             OR (mh.recipient IS NOT NULL AND (pc.email = mh.recipient OR pc.email2 = mh.recipient))
           )
       )`;

  const { rows: orphans } = await pool.query<OrphanRow>(
    `SELECT
       mh.channel,
       mh.linkedin_url,
       mh.recipient,
       MAX(mh.contact_name) AS contact_name,
       mh.company_name,
       mh.offer_title,
       COUNT(*)::int AS message_count,
       MAX(mh.sent_at) AS last_sent
     FROM prospect_message_history mh
     WHERE mh.user_id = $1
       ${orphanFilter}
     GROUP BY mh.channel, mh.linkedin_url, mh.recipient, mh.company_name, mh.offer_title
     ORDER BY mh.company_name, mh.offer_title`,
    [userId],
  );

  if (!orphans.length) {
    console.log("Rien à récupérer — aucun orphelin trouvé.");
    return;
  }

  // Group by (company, offer_title, contact_key) so each contact exists once
  type ContactKey = string;
  type Offer = {
    companyName: string;
    offerTitle: string;
    contacts: Map<
      ContactKey,
      {
        linkedinUrl: string | null;
        email: string | null;
        fullName: string | null;
        emailSentAt: Date | null;
        linkedinSentAt: Date | null;
        whatsappSentAt: Date | null;
      }
    >;
  };
  const offerMap = new Map<string, Offer>();

  for (const r of orphans) {
    const companyName = r.company_name || "Entreprise inconnue";
    const offerTitle = r.offer_title || "(Offre sans titre)";
    const offerKey = `${companyName.toLowerCase()}::${offerTitle.toLowerCase()}`;

    let offer = offerMap.get(offerKey);
    if (!offer) {
      offer = { companyName, offerTitle, contacts: new Map() };
      offerMap.set(offerKey, offer);
    }

    const contactKey =
      r.linkedin_url?.toLowerCase() ||
      r.recipient?.toLowerCase() ||
      `${r.contact_name || "?"}::${r.channel}`;

    let c = offer.contacts.get(contactKey);
    if (!c) {
      c = {
        linkedinUrl: r.linkedin_url,
        email: r.channel === "email" ? r.recipient : null,
        fullName: r.contact_name,
        emailSentAt: null,
        linkedinSentAt: null,
        whatsappSentAt: null,
      };
      offer.contacts.set(contactKey, c);
    }
    // Merge fields: pick most informative versions
    if (!c.linkedinUrl && r.linkedin_url) c.linkedinUrl = r.linkedin_url;
    if (!c.email && r.channel === "email" && r.recipient) c.email = r.recipient;
    if (!c.fullName && r.contact_name) c.fullName = r.contact_name;

    if (r.channel === "email" && (!c.emailSentAt || r.last_sent > c.emailSentAt))
      c.emailSentAt = r.last_sent;
    if (r.channel === "linkedin" && (!c.linkedinSentAt || r.last_sent > c.linkedinSentAt))
      c.linkedinSentAt = r.last_sent;
    if (r.channel === "whatsapp" && (!c.whatsappSentAt || r.last_sent > c.whatsappSentAt))
      c.whatsappSentAt = r.last_sent;
  }

  console.log(
    `\n${COMMIT ? "💾 COMMIT" : "🧪 DRY-RUN"} — utilisateur : ${userEmail}${ALL ? " (mode --all : tout l'historique)" : " (orphelins uniquement)"}`,
  );
  console.log(`→ ${offerMap.size} offre(s) à créer, ${orphans.length} ligne(s) d'historique\n`);

  for (const offer of offerMap.values()) {
    console.log(`• ${offer.companyName} — ${offer.offerTitle}`);
    for (const c of offer.contacts.values()) {
      const channels = [
        c.emailSentAt && `email ${c.emailSentAt.toLocaleDateString("fr-FR")}`,
        c.linkedinSentAt && `linkedin ${c.linkedinSentAt.toLocaleDateString("fr-FR")}`,
        c.whatsappSentAt && `whatsapp ${c.whatsappSentAt.toLocaleDateString("fr-FR")}`,
      ]
        .filter(Boolean)
        .join(", ");
      console.log(
        `    - ${c.fullName || "?"} <${c.email || c.linkedinUrl || "?"}> [${channels}]`,
      );
    }
  }

  if (!COMMIT) {
    console.log("\n(ré-exécute avec --commit pour appliquer)");
    return;
  }

  // Actual writes
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: listRows } = await client.query<{ id: string }>(
      `INSERT INTO prospect_list (user_id, name, pitch)
       VALUES ($1, $2, $3) RETURNING id`,
      [
        userId,
        "Récupération — historique",
        DISABLE
          ? "Liste reconstruite depuis l'historique des messages. Les offres sont désactivées par défaut."
          : "Liste reconstruite depuis l'historique des messages après suppression de la liste d'origine.",
      ],
    );
    const listId = listRows[0].id;

    for (const offer of offerMap.values()) {
      const { rows: offerRows } = await client.query<{ id: string }>(
        `INSERT INTO prospect_offer (list_id, company_name, offer_title, disabled_at)
         VALUES ($1, $2, $3, ${DISABLE ? "NOW()" : "NULL"}) RETURNING id`,
        [listId, offer.companyName, offer.offerTitle],
      );
      const offerId = offerRows[0].id;

      for (const c of offer.contacts.values()) {
        await client.query(
          `INSERT INTO prospect_contact
             (offer_id, linkedin_url, email, full_name,
              email_sent_at, linkedin_sent_at, whatsapp_sent_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            offerId,
            c.linkedinUrl,
            c.email,
            c.fullName,
            c.emailSentAt,
            c.linkedinSentAt,
            c.whatsappSentAt,
          ],
        );
      }
    }

    if (RESET_ACTIVES) {
      // For every (channel, contact_key) we just materialised in the recovery
      // list, null out the matching sent_at on the user's other-list contacts
      // IFF that sent_at exactly matches an existing message_history row.  That
      // last check makes sure we only undo the 0006 back-fill and never wipe a
      // date the user actually produced with a real send.
      const resetResult = await client.query(
        `WITH keys AS (
           SELECT mh.channel,
                  mh.linkedin_url,
                  mh.recipient,
                  MIN(mh.sent_at) AS history_min
           FROM prospect_message_history mh
           WHERE mh.user_id = $1
           GROUP BY mh.channel, mh.linkedin_url, mh.recipient
         )
         UPDATE prospect_contact pc
         SET email_sent_at = CASE
               WHEN EXISTS (
                 SELECT 1 FROM keys k
                 WHERE k.channel = 'email'
                   AND k.history_min = pc.email_sent_at
                   AND (
                     (k.linkedin_url IS NOT NULL AND pc.linkedin_url = k.linkedin_url)
                     OR (k.recipient IS NOT NULL AND (pc.email = k.recipient OR pc.email2 = k.recipient))
                   )
               ) THEN NULL ELSE pc.email_sent_at
             END,
             linkedin_sent_at = CASE
               WHEN EXISTS (
                 SELECT 1 FROM keys k
                 WHERE k.channel = 'linkedin'
                   AND k.history_min = pc.linkedin_sent_at
                   AND (
                     (k.linkedin_url IS NOT NULL AND pc.linkedin_url = k.linkedin_url)
                     OR (k.recipient IS NOT NULL AND (pc.email = k.recipient OR pc.email2 = k.recipient))
                   )
               ) THEN NULL ELSE pc.linkedin_sent_at
             END,
             whatsapp_sent_at = CASE
               WHEN EXISTS (
                 SELECT 1 FROM keys k
                 WHERE k.channel = 'whatsapp'
                   AND k.history_min = pc.whatsapp_sent_at
                   AND (
                     (k.linkedin_url IS NOT NULL AND pc.linkedin_url = k.linkedin_url)
                     OR (k.recipient IS NOT NULL AND (pc.email = k.recipient OR pc.email2 = k.recipient))
                   )
               ) THEN NULL ELSE pc.whatsapp_sent_at
             END
         FROM prospect_offer po
         INNER JOIN prospect_list pl ON pl.id = po.list_id
         WHERE pc.offer_id = po.id
           AND pl.user_id = $1
           AND po.list_id <> $2`,
        [userId, listId],
      );
      console.log(`   ↳ reset ${resetResult.rowCount ?? 0} contact(s) actif(s)`);
    }

    await client.query("COMMIT");
    console.log(`\n✅ Liste "Récupération — historique" créée (id ${listId}).`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("\n❌ Échec — rollback.", e);
    process.exit(1);
  } finally {
    client.release();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pool.end());
