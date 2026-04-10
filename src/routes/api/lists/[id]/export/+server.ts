import { db } from "$lib/server/db";
import { prospectList, prospectOffer, prospectContact } from "$lib/server/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import type { RequestHandler } from "./$types";

function escapeCsv(value: string | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(";") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) {
    return new Response("Non authentifié", { status: 401 });
  }

  // Verify list ownership
  const lists = await db
    .select()
    .from(prospectList)
    .where(and(eq(prospectList.id, params.id), eq(prospectList.userId, locals.user.id)))
    .limit(1);

  if (!lists.length) {
    return new Response("Liste introuvable", { status: 404 });
  }

  const listName = lists[0].name;

  // Fetch offers with their contacts
  const offers = await db
    .select()
    .from(prospectOffer)
    .where(eq(prospectOffer.listId, params.id));

  const offerIds = offers.map((o) => o.id);

  const contacts =
    offerIds.length > 0
      ? await db
          .select()
          .from(prospectContact)
          .where(inArray(prospectContact.offerId, offerIds))
      : [];

  // Group contacts by offerId
  const contactsByOffer = new Map<string, typeof contacts>();
  for (const c of contacts) {
    if (!contactsByOffer.has(c.offerId)) contactsByOffer.set(c.offerId, []);
    contactsByOffer.get(c.offerId)!.push(c);
  }

  const headers = ["Entreprise", "Offre", "Localisation", "Nom du décisionnaire", "Titre", "LinkedIn", "Email", "Téléphone 1", "Téléphone 2"];
  const rows: string[][] = [headers];

  for (const offer of offers) {
    const offerContacts = contactsByOffer.get(offer.id) ?? [];

    if (offerContacts.length === 0) {
      rows.push([offer.companyName, offer.offerTitle ?? "", offer.offerLocation ?? "", "", "", "", "", "", ""]);
    } else {
      for (const contact of offerContacts) {
        rows.push([
          offer.companyName,
          offer.offerTitle ?? "",
          offer.offerLocation ?? "",
          contact.fullName ?? "",
          contact.jobTitle ?? "",
          contact.linkedinUrl ?? "",
          contact.email ?? "",
          contact.phone1 ?? "",
          contact.phone2 ?? "",
        ]);
      }
    }
  }

  const csvContent = rows.map((row) => row.map(escapeCsv).join(";")).join("\r\n");
  const filename = `export_${listName.replace(/[^a-z0-9]/gi, "_")}.csv`;

  return new Response(csvContent, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
};
