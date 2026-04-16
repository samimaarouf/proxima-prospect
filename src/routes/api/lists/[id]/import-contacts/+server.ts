import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { prospectList, prospectOffer, prospectContact } from "$lib/server/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import type { RequestHandler } from "./$types";

function parseCsv(text: string): Record<string, string>[] {
  const normalized = text.replace(/\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === '"') {
      if (inQuotes && normalized[i + 1] === '"') { currentField += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (!inQuotes && (ch === "," || ch === ";")) {
      currentRow.push(currentField);
      currentField = "";
    } else if (!inQuotes && ch === "\n") {
      currentRow.push(currentField);
      currentField = "";
      if (currentRow.some((f) => f.trim())) rows.push(currentRow);
      currentRow = [];
    } else {
      currentField += ch;
    }
  }
  currentRow.push(currentField);
  if (currentRow.some((f) => f.trim())) rows.push(currentRow);

  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((values) => {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (values[i] ?? "").trim(); });
    return row;
  });
}

export const POST: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) return json({ error: "Non authentifié" }, { status: 401 });

  const lists = await db
    .select()
    .from(prospectList)
    .where(and(eq(prospectList.id, params.id), eq(prospectList.userId, locals.user.id)))
    .limit(1);

  if (!lists.length) return json({ error: "Liste introuvable" }, { status: 404 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return json({ error: "Fichier manquant" }, { status: 400 });

  const text = await file.text();
  const rows = parseCsv(text);
  if (!rows.length) return json({ error: "CSV vide ou invalide" }, { status: 400 });

  // Load all contacts for this list (across all offers)
  const offers = await db
    .select({ id: prospectOffer.id })
    .from(prospectOffer)
    .where(eq(prospectOffer.listId, params.id));

  const offerIds = offers.map((o) => o.id);
  if (!offerIds.length) return json({ error: "Aucune offre dans cette liste" }, { status: 400 });

  const allContacts = await db
    .select()
    .from(prospectContact)
    .where(inArray(prospectContact.offerId, offerIds));

  // Index by linkedin URL and by fullName (lowercased) for fast lookup
  const byLinkedin = new Map<string, typeof allContacts[0]>();
  const byFullName = new Map<string, typeof allContacts[0]>();
  for (const c of allContacts) {
    if (c.linkedinUrl) byLinkedin.set(c.linkedinUrl.toLowerCase().trim(), c);
    if (c.fullName) byFullName.set(c.fullName.toLowerCase().trim(), c);
  }

  let updated = 0;
  let notFound = 0;

  for (const row of rows) {
    const nom = row["Nom"] ?? "";
    const prenom = row["Prénom"] ?? row["Prenom"] ?? "";
    const linkedin = (row["LinkedIn"] ?? "").trim();
    const email1 = (row["Email 1"] ?? "").trim();
    const email2 = (row["Email 2"] ?? "").trim();
    const tel1 = (row["Tél 1"] ?? row["Tel 1"] ?? "").trim();
    const tel2 = (row["Tél 2"] ?? row["Tel 2"] ?? "").trim();

    // Reconstruct fullName
    const fullName = [prenom, nom].filter(Boolean).join(" ") || null;

    // Match contact
    let matched: typeof allContacts[0] | undefined;
    if (linkedin) matched = byLinkedin.get(linkedin.toLowerCase());
    if (!matched && fullName) matched = byFullName.get(fullName.toLowerCase());

    if (!matched) { notFound++; continue; }

    // Only overwrite non-empty values
    await db
      .update(prospectContact)
      .set({
        ...(email1 ? { email: email1 } : {}),
        ...(email2 ? { email2 } : {}),
        ...(tel1 ? { phone1: tel1 } : {}),
        ...(tel2 ? { phone2: tel2 } : {}),
        ...(fullName ? { fullName } : {}),
        updatedAt: new Date(),
      })
      .where(eq(prospectContact.id, matched.id));

    updated++;
  }

  return json({ updated, notFound, total: rows.length });
};
