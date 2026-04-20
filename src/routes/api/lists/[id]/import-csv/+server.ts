import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { prospectList, prospectOffer, prospectContact } from "$lib/server/db/schema";
import { eq, and } from "drizzle-orm";
import type { RequestHandler } from "./$types";
import { buildOfferIndex, loadUserOffers } from "$lib/server/offerMatch";

// Parse CSV properly handling multi-line quoted fields and auto-detecting separator
function parseCsv(text: string): Record<string, string>[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Tokenize the entire file character by character so quoted newlines are preserved
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === '"') {
      if (inQuotes && normalized[i + 1] === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && (ch === "," || ch === ";")) {
      currentRow.push(currentField);
      currentField = "";
    } else if (!inQuotes && ch === "\n") {
      currentRow.push(currentField);
      currentField = "";
      if (currentRow.some((f) => f.trim())) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentField += ch;
    }
  }
  // Push last field/row
  currentRow.push(currentField);
  if (currentRow.some((f) => f.trim())) rows.push(currentRow);

  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((values) => {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (values[i] ?? "").trim();
    });
    return row;
  });
}

export const POST: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) return json({ error: "Non authentifié" }, { status: 401 });

  // Verify list ownership
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

  // Pre-load every offer the user already has (across every list) so we can
  // skip rows whose offer already exists somewhere. Matching is done on the
  // normalized offerUrl when present, otherwise on (companyName + offerTitle).
  const existingOffers = await loadUserOffers(locals.user.id);
  const offerIndex = buildOfferIndex(existingOffers);

  let imported = 0;
  let skipped = 0;
  let duplicates = 0;

  for (const row of rows) {
    const companyName = row["Entreprise"] || row["Company"] || "";
    const offerTitle = row["Exemple d'offre"] || row["Offre"] || row["Intitulé du poste"] || "";
    const offerUrl = row["URL offre"] || row["Domaine"] || row["Domain"] || null;
    const linkedinCeo = row["LinkedIn CEO/Fondateur"] || row["LinkedIn"] || "";
    const localisation = row["Localisation"] || row["Ville"] || null;

    if (!companyName) { skipped++; continue; }

    const candidate = {
      companyName,
      offerTitle: offerTitle || null,
      offerUrl: offerUrl || null,
    };

    if (offerIndex.hasMatch(candidate)) {
      duplicates++;
      continue;
    }

    // Create one offer per row
    const [offer] = await db
      .insert(prospectOffer)
      .values({
        listId: params.id,
        companyName,
        offerTitle: offerTitle || null,
        offerUrl: offerUrl || null,
        offerLocation: localisation,
      })
      .returning();

    // Create the CEO/Fondateur contact only if a valid LinkedIn URL is present
    const linkedinUrl =
      linkedinCeo && linkedinCeo !== "Not Found" && linkedinCeo.startsWith("http")
        ? linkedinCeo
        : null;

    if (linkedinUrl) {
      await db.insert(prospectContact).values({
        offerId: offer.id,
        linkedinUrl,
        contactStatus: "undefined",
      });
    }

    offerIndex.add(candidate);
    imported++;
  }

  return json({ imported, skipped, duplicates });
};
