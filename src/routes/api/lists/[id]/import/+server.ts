import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { prospectList, prospectOffer, prospectContact } from "$lib/server/db/schema";
import { eq, and } from "drizzle-orm";
import type { RequestHandler } from "./$types";
import { buildOfferIndex, loadUserOffers } from "$lib/server/offerMatch";

// New Excel column format (0-indexed):
// Entreprise | Intitulé du poste | URL Offre | Localisation | LinkedIn | Tél. 1 | Tél. 2 | Email | Date | Touches | Action | Étape | Notes
const COL_NEW = {
  COMPANY: 0,
  OFFER_TITLE: 1,
  OFFER_URL: 2,
  OFFER_LOCATION: 3,
  LINKEDIN: 4,
  PHONE1: 5,
  PHONE2: 6,
  EMAIL: 7,
  WHEN: 8,
  TOUCH: 9,
  ACTION: 10,
  NEXT_STEP: 11,
  NOTES: 12,
} as const;

// Legacy Excel column format (backward compat):
// Entreprise | Offre (URL) | LinkedIn | Tél. 1 | Tél. 2 | Email | Date | Touches | Action | Étape | Notes
const COL_LEGACY = {
  COMPANY: 0,
  OFFER_URL: 1,
  LINKEDIN: 2,
  PHONE1: 3,
  PHONE2: 4,
  EMAIL: 5,
  WHEN: 6,
  TOUCH: 7,
  ACTION: 8,
  NEXT_STEP: 9,
  NOTES: 10,
} as const;

// Detect format: if col 1 on company rows looks like a URL → legacy format
function detectLegacyFormat(dataRows: (string | number | null | undefined)[][]): boolean {
  for (const row of dataRows) {
    const col0 = row[0];
    const col1 = row[1];
    if (col0 !== null && col0 !== undefined && String(col0).trim() !== "") {
      if (col1 !== null && col1 !== undefined) {
        const val = String(col1).trim();
        if (val.startsWith("http") || val.startsWith("www.") || val.startsWith("linkedin.")) {
          return true;
        }
      }
      break; // Only check the first company row
    }
  }
  return false;
}

export const POST: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) {
    return json({ error: "Non authentifié" }, { status: 401 });
  }

  // Verify list ownership
  const list = await db
    .select()
    .from(prospectList)
    .where(and(eq(prospectList.id, params.id), eq(prospectList.userId, locals.user.id)))
    .limit(1);

  if (!list.length) {
    return json({ error: "Liste introuvable" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return json({ error: "Aucun fichier fourni" }, { status: 400 });
  }

  try {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "buffer" });

    // Use first sheet (as per the plan)
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return json({ error: "Fichier Excel vide" }, { status: 400 });
    }

    const worksheet = workbook.Sheets[sheetName];
    const rawRows: (string | number | null | undefined)[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: null,
    });

    if (rawRows.length < 2) {
      return json({ error: "Le fichier ne contient pas de données" }, { status: 400 });
    }

    // Skip the header row (row 0)
    const dataRows = rawRows.slice(1);

    // Auto-detect format based on first company row
    const isLegacy = detectLegacyFormat(dataRows);
    const COL = isLegacy ? {
      COMPANY: COL_LEGACY.COMPANY,
      OFFER_TITLE: -1, // not available in legacy
      OFFER_URL: COL_LEGACY.OFFER_URL,
      OFFER_LOCATION: -1,
      LINKEDIN: COL_LEGACY.LINKEDIN,
      PHONE1: COL_LEGACY.PHONE1,
      PHONE2: COL_LEGACY.PHONE2,
      EMAIL: COL_LEGACY.EMAIL,
      WHEN: COL_LEGACY.WHEN,
      TOUCH: COL_LEGACY.TOUCH,
      ACTION: COL_LEGACY.ACTION,
      NEXT_STEP: COL_LEGACY.NEXT_STEP,
      NOTES: COL_LEGACY.NOTES,
    } : {
      COMPANY: COL_NEW.COMPANY,
      OFFER_TITLE: COL_NEW.OFFER_TITLE,
      OFFER_URL: COL_NEW.OFFER_URL,
      OFFER_LOCATION: COL_NEW.OFFER_LOCATION,
      LINKEDIN: COL_NEW.LINKEDIN,
      PHONE1: COL_NEW.PHONE1,
      PHONE2: COL_NEW.PHONE2,
      EMAIL: COL_NEW.EMAIL,
      WHEN: COL_NEW.WHEN,
      TOUCH: COL_NEW.TOUCH,
      ACTION: COL_NEW.ACTION,
      NEXT_STEP: COL_NEW.NEXT_STEP,
      NOTES: COL_NEW.NOTES,
    };

    // Parse hierarchical structure:
    // - New company block starts when column A (COMPANY) is non-null
    type ParsedContact = {
      companyName: string;
      offerTitle: string | null;
      offerUrl: string | null;
      offerLocation: string | null;
      linkedinUrl: string | null;
      phone1: string | null;
      phone2: string | null;
      email: string | null;
      lastContactDate: string | null;
      touchCount: string | null;
      lastAction: string | null;
      nextStep: string | null;
      notes: string | null;
    };

    const parsed: ParsedContact[] = [];
    let currentCompany = "";
    let currentOfferTitle: string | null = null;
    let currentOfferUrl: string | null = null;
    let currentOfferLocation: string | null = null;

    function str(val: unknown): string | null {
      if (val === null || val === undefined) return null;
      const s = String(val).trim();
      return s || null;
    }

    for (const row of dataRows) {
      const companyCell = row[COL.COMPANY];
      const linkedinCell = COL.LINKEDIN >= 0 ? row[COL.LINKEDIN] : null;

      const isNewCompanyRow = companyCell !== null && companyCell !== undefined && String(companyCell).trim() !== "";

      if (isNewCompanyRow) {
        currentCompany = String(companyCell).trim();
        currentOfferTitle = COL.OFFER_TITLE >= 0 ? str(row[COL.OFFER_TITLE]) : null;
        currentOfferUrl = COL.OFFER_URL >= 0 ? str(row[COL.OFFER_URL]) : null;
        currentOfferLocation = COL.OFFER_LOCATION >= 0 ? str(row[COL.OFFER_LOCATION]) : null;

        if (linkedinCell && String(linkedinCell).trim()) {
          parsed.push({
            companyName: currentCompany,
            offerTitle: currentOfferTitle,
            offerUrl: currentOfferUrl,
            offerLocation: currentOfferLocation,
            linkedinUrl: normalizeLinkedInUrl(String(linkedinCell).trim()),
            phone1: COL.PHONE1 >= 0 ? str(row[COL.PHONE1]) : null,
            phone2: COL.PHONE2 >= 0 ? str(row[COL.PHONE2]) : null,
            email: COL.EMAIL >= 0 ? str(row[COL.EMAIL]) : null,
            lastContactDate: COL.WHEN >= 0 ? str(row[COL.WHEN]) : null,
            touchCount: COL.TOUCH >= 0 ? str(row[COL.TOUCH]) : null,
            lastAction: COL.ACTION >= 0 ? str(row[COL.ACTION]) : null,
            nextStep: COL.NEXT_STEP >= 0 ? str(row[COL.NEXT_STEP]) : null,
            notes: COL.NOTES >= 0 ? str(row[COL.NOTES]) : null,
          });
        }
      } else if (currentCompany && (linkedinCell || (COL.PHONE1 >= 0 && row[COL.PHONE1]) || (COL.EMAIL >= 0 && row[COL.EMAIL]))) {
        parsed.push({
          companyName: currentCompany,
          offerTitle: currentOfferTitle,
          offerUrl: currentOfferUrl,
          offerLocation: currentOfferLocation,
          linkedinUrl: linkedinCell ? normalizeLinkedInUrl(String(linkedinCell).trim()) : null,
          phone1: COL.PHONE1 >= 0 ? str(row[COL.PHONE1]) : null,
          phone2: COL.PHONE2 >= 0 ? str(row[COL.PHONE2]) : null,
          email: COL.EMAIL >= 0 ? str(row[COL.EMAIL]) : null,
          lastContactDate: COL.WHEN >= 0 ? str(row[COL.WHEN]) : null,
          touchCount: COL.TOUCH >= 0 ? str(row[COL.TOUCH]) : null,
          lastAction: COL.ACTION >= 0 ? str(row[COL.ACTION]) : null,
          nextStep: COL.NEXT_STEP >= 0 ? str(row[COL.NEXT_STEP]) : null,
          notes: COL.NOTES >= 0 ? str(row[COL.NOTES]) : null,
        });
      }
    }

    if (parsed.length === 0) {
      return json({ error: "Aucun contact valide trouvé dans le fichier" }, { status: 400 });
    }

    // Pre-load every offer the user already has (across every list) so we can
    // skip rows whose offer already exists somewhere. Matching is done on the
    // normalized offerUrl when present, otherwise on (companyName + offerTitle).
    const existingOffers = await loadUserOffers(locals.user.id);
    const existingIndex = buildOfferIndex(existingOffers);

    // Group contacts by company+offer to create offers first
    const offerMap = new Map<string, string>(); // key: "companyName||offerTitle||offerUrl" => offerId
    let contactsCreated = 0;
    let offersCreated = 0;
    let offersSkipped = 0;
    const skippedOfferKeys = new Set<string>();

    for (const contact of parsed) {
      const offerKey = `${contact.companyName}||${contact.offerTitle || ""}||${contact.offerUrl || ""}`;

      // Skip every row whose offer already exists for this user (any list).
      if (skippedOfferKeys.has(offerKey)) continue;
      if (!offerMap.has(offerKey) && existingIndex.hasMatch(contact)) {
        skippedOfferKeys.add(offerKey);
        offersSkipped++;
        continue;
      }

      if (!offerMap.has(offerKey)) {
        // Create or find offer
        const [newOffer] = await db
          .insert(prospectOffer)
          .values({
            listId: params.id,
            companyName: contact.companyName,
            offerTitle: contact.offerTitle,
            offerUrl: contact.offerUrl,
            offerLocation: contact.offerLocation,
          })
          .returning({ id: prospectOffer.id });
        offerMap.set(offerKey, newOffer.id);
        existingIndex.add(contact);
        offersCreated++;
      }

      const offerId = offerMap.get(offerKey)!;

      // Upsert contact (by offerId + linkedinUrl if available)
      if (contact.linkedinUrl) {
        // Check if exists
        const existing = await db
          .select({ id: prospectContact.id })
          .from(prospectContact)
          .where(and(eq(prospectContact.offerId, offerId), eq(prospectContact.linkedinUrl, contact.linkedinUrl)))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(prospectContact).values({
            offerId,
            linkedinUrl: contact.linkedinUrl,
            phone1: contact.phone1,
            phone2: contact.phone2,
            email: contact.email,
            lastContactDate: contact.lastContactDate,
            touchCount: contact.touchCount,
            lastAction: contact.lastAction,
            nextStep: contact.nextStep,
            notes: contact.notes,
          });
          contactsCreated++;
        }
      } else {
        // No LinkedIn URL — insert as a new contact
        await db.insert(prospectContact).values({
          offerId,
          linkedinUrl: null,
          phone1: contact.phone1,
          phone2: contact.phone2,
          email: contact.email,
          lastContactDate: contact.lastContactDate,
          touchCount: contact.touchCount,
          lastAction: contact.lastAction,
          nextStep: contact.nextStep,
          notes: contact.notes,
        });
        contactsCreated++;
      }
    }

    return json({ success: true, contactsCreated, offersCreated, offersSkipped });
  } catch (err) {
    console.error("Import error:", err);
    return json(
      { error: err instanceof Error ? err.message : "Erreur lors de l'import" },
      { status: 500 }
    );
  }
};

function normalizeLinkedInUrl(url: string): string {
  if (!url) return url;
  // Normalize various LinkedIn URL formats
  if (url.startsWith("http")) return url;
  if (url.startsWith("linkedin.com")) return `https://${url}`;
  if (url.startsWith("www.linkedin.com")) return `https://${url}`;
  return url;
}
