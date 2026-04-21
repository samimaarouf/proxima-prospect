import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { prospectList, prospectOffer, prospectContact } from "$lib/server/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import type { RequestHandler } from "./$types";
import { normalizeLinkedInUrl } from "$lib/linkedinUrl";
import { backfillSentDatesForList } from "$lib/server/backfillSentDates";

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

async function parseExcel(buffer: ArrayBuffer): Promise<Record<string, string>[]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const worksheet = workbook.Sheets[sheetName];
  const rawRows: (string | number | null | undefined)[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: null,
  });
  if (rawRows.length < 2) return [];
  const headers = rawRows[0].map((h) => String(h ?? "").trim());
  return rawRows.slice(1)
    .filter((row) => row.some((c) => c !== null && c !== undefined && String(c).trim() !== ""))
    .map((values) => {
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = String(values[i] ?? "").trim(); });
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

  const isExcel = file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls");
  let rows: Record<string, string>[];
  if (isExcel) {
    const buffer = await file.arrayBuffer();
    rows = await parseExcel(buffer);
  } else {
    const text = await file.text();
    rows = parseCsv(text);
  }
  if (!rows.length) return json({ error: "Fichier vide ou invalide" }, { status: 400 });

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

  // Index by normalised LinkedIn URL + fullName.  Each key can point to
  // MULTIPLE contacts (e.g. same CEO shared across offers pre-dedupe) so we
  // update every match instead of silently dropping all but one.
  const byLinkedin = new Map<string, typeof allContacts>();
  const byFullName = new Map<string, typeof allContacts>();
  for (const c of allContacts) {
    const li = normalizeLinkedInUrl(c.linkedinUrl);
    if (li) {
      const bucket = byLinkedin.get(li) ?? [];
      bucket.push(c);
      byLinkedin.set(li, bucket);
    }
    if (c.fullName) {
      const key = c.fullName.toLowerCase().trim();
      const bucket = byFullName.get(key) ?? [];
      bucket.push(c);
      byFullName.set(key, bucket);
    }
  }

  let updated = 0;
  let notFound = 0;

  // Detect format: candidate_* columns vs. our Nom/Prénom/LinkedIn format
  const firstRow = rows[0] ?? {};
  const isCandidateFormat = Object.keys(firstRow).some((k) => k.startsWith("candidate_"));

  for (const row of rows) {
    let linkedin: string;
    let email1: string;
    let email2: string;
    let tel1: string;
    let tel2: string;
    let fullName: string | null;

    if (isCandidateFormat) {
      // Support both candidate__linkedin and candidate_li / candidate_linkedin variants
      linkedin = (
        row["candidate__linkedin"] ??
        row["candidate_linkedin"] ??
        row["candidate_li"] ??
        ""
      ).trim();
      email1 = (row["candidate__email_1"] ?? row["candidate_e"] ?? row["candidate_email"] ?? "").trim();
      email2 = (row["candidate__email_2"] ?? row["candidate_e2"] ?? "").trim();
      tel1 = (row["candidate__phone_1"] ?? row["candidate_p"] ?? row["candidate_phone"] ?? "").trim();
      tel2 = (row["candidate__phone_2"] ?? row["candidate_p2"] ?? "").trim();
      fullName = (row["candidate__name"] ?? row["candidate_r"] ?? row["candidate_name"] ?? "").trim() || null;
    } else {
      const nom = row["Nom"] ?? "";
      const prenom = row["Prénom"] ?? row["Prenom"] ?? "";
      linkedin = (row["LinkedIn"] ?? "").trim();
      email1 = (row["Email 1"] ?? "").trim();
      email2 = (row["Email 2"] ?? "").trim();
      tel1 = (row["Tél 1"] ?? row["Tel 1"] ?? "").trim();
      tel2 = (row["Tél 2"] ?? row["Tel 2"] ?? "").trim();
      fullName = [prenom, nom].filter(Boolean).join(" ") || null;
    }

    // Match contact — LinkedIn wins over name.  Multiple rows in the DB can
    // share the same LinkedIn (legacy data) → update every one of them so
    // the enrichment doesn't get lost.
    let matches: typeof allContacts = [];
    const normalizedLinkedIn = normalizeLinkedInUrl(linkedin);
    if (normalizedLinkedIn) matches = byLinkedin.get(normalizedLinkedIn) ?? [];
    if (matches.length === 0 && fullName) {
      matches = byFullName.get(fullName.toLowerCase()) ?? [];
    }

    if (matches.length === 0) { notFound++; continue; }

    const patch = {
      ...(email1 ? { email: email1 } : {}),
      ...(email2 ? { email2 } : {}),
      ...(tel1 ? { phone1: tel1 } : {}),
      ...(tel2 ? { phone2: tel2 } : {}),
      ...(fullName ? { fullName } : {}),
      // Persist the canonical URL so future imports keep matching cleanly.
      ...(normalizedLinkedIn ? { linkedinUrl: normalizedLinkedIn } : {}),
      updatedAt: new Date(),
    };
    await db
      .update(prospectContact)
      .set(patch)
      .where(inArray(prospectContact.id, matches.map((m) => m.id)));

    updated += matches.length;
  }

  // Enrichment often adds an email that finally matches a past
  // message_history row — backfill so the contact shows up as contacted.
  if (updated > 0) {
    try { await backfillSentDatesForList(locals.user.id, params.id); }
    catch (e) { console.warn("[import-contacts] backfill failed:", e); }
  }

  return json({ updated, notFound, total: rows.length });
};
