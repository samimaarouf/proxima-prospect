import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { prospectList, prospectOffer, prospectContact } from "$lib/server/db/schema";
import { eq, and } from "drizzle-orm";
import type { RequestHandler } from "./$types";

// Parse a semicolon-separated CSV with quoted values
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h.trim()] = (values[i] ?? "").trim();
    });
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ";" && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
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

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const companyName = row["Entreprise"] || row["Company"] || "";
    const offerTitle = row["Exemple d'offre"] || row["Offre"] || "";
    const offerUrl = row["Domaine"] || row["Domain"] || null;
    const linkedinCeo = row["LinkedIn CEO/Fondateur"] || row["LinkedIn"] || "";
    const localisation = row["Localisation"] || null;

    if (!companyName) { skipped++; continue; }

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

    // Create the CEO/Fondateur contact if a valid LinkedIn URL is present
    const linkedinUrl =
      linkedinCeo && linkedinCeo !== "Not Found" && linkedinCeo.startsWith("http")
        ? linkedinCeo
        : null;

    await db.insert(prospectContact).values({
      offerId: offer.id,
      linkedinUrl,
      contactStatus: "to_contact",
    });

    imported++;
  }

  return json({ imported, skipped });
};
