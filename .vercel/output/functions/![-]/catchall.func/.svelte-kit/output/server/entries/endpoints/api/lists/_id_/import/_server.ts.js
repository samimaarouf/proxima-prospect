import { json } from "@sveltejs/kit";
import { d as db, b as prospectList, a as prospectOffer, p as prospectContact } from "../../../../../../chunks/index2.js";
import { and, eq } from "drizzle-orm";
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
  NOTES: 12
};
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
  NOTES: 10
};
function detectLegacyFormat(dataRows) {
  for (const row of dataRows) {
    const col0 = row[0];
    const col1 = row[1];
    if (col0 !== null && col0 !== void 0 && String(col0).trim() !== "") {
      if (col1 !== null && col1 !== void 0) {
        const val = String(col1).trim();
        if (val.startsWith("http") || val.startsWith("www.") || val.startsWith("linkedin.")) {
          return true;
        }
      }
      break;
    }
  }
  return false;
}
const POST = async ({ locals, params, request }) => {
  if (!locals.user) {
    return json({ error: "Non authentifié" }, { status: 401 });
  }
  const list = await db.select().from(prospectList).where(and(eq(prospectList.id, params.id), eq(prospectList.userId, locals.user.id))).limit(1);
  if (!list.length) {
    return json({ error: "Liste introuvable" }, { status: 404 });
  }
  const formData = await request.formData();
  const file = formData.get("file");
  if (!file) {
    return json({ error: "Aucun fichier fourni" }, { status: 400 });
  }
  try {
    let str = function(val) {
      if (val === null || val === void 0) return null;
      const s = String(val).trim();
      return s || null;
    };
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return json({ error: "Fichier Excel vide" }, { status: 400 });
    }
    const worksheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: null
    });
    if (rawRows.length < 2) {
      return json({ error: "Le fichier ne contient pas de données" }, { status: 400 });
    }
    const dataRows = rawRows.slice(1);
    const isLegacy = detectLegacyFormat(dataRows);
    const COL = isLegacy ? {
      COMPANY: COL_LEGACY.COMPANY,
      OFFER_TITLE: -1,
      // not available in legacy
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
      NOTES: COL_LEGACY.NOTES
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
      NOTES: COL_NEW.NOTES
    };
    const parsed = [];
    let currentCompany = "";
    let currentOfferTitle = null;
    let currentOfferUrl = null;
    let currentOfferLocation = null;
    for (const row of dataRows) {
      const companyCell = row[COL.COMPANY];
      const linkedinCell = COL.LINKEDIN >= 0 ? row[COL.LINKEDIN] : null;
      const isNewCompanyRow = companyCell !== null && companyCell !== void 0 && String(companyCell).trim() !== "";
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
            notes: COL.NOTES >= 0 ? str(row[COL.NOTES]) : null
          });
        }
      } else if (currentCompany && (linkedinCell || COL.PHONE1 >= 0 && row[COL.PHONE1] || COL.EMAIL >= 0 && row[COL.EMAIL])) {
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
          notes: COL.NOTES >= 0 ? str(row[COL.NOTES]) : null
        });
      }
    }
    if (parsed.length === 0) {
      return json({ error: "Aucun contact valide trouvé dans le fichier" }, { status: 400 });
    }
    const offerMap = /* @__PURE__ */ new Map();
    let contactsCreated = 0;
    let offersCreated = 0;
    for (const contact of parsed) {
      const offerKey = `${contact.companyName}||${contact.offerTitle || ""}||${contact.offerUrl || ""}`;
      if (!offerMap.has(offerKey)) {
        const [newOffer] = await db.insert(prospectOffer).values({
          listId: params.id,
          companyName: contact.companyName,
          offerTitle: contact.offerTitle,
          offerUrl: contact.offerUrl,
          offerLocation: contact.offerLocation
        }).returning({ id: prospectOffer.id });
        offerMap.set(offerKey, newOffer.id);
        offersCreated++;
      }
      const offerId = offerMap.get(offerKey);
      if (contact.linkedinUrl) {
        const existing = await db.select({ id: prospectContact.id }).from(prospectContact).where(and(eq(prospectContact.offerId, offerId), eq(prospectContact.linkedinUrl, contact.linkedinUrl))).limit(1);
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
            notes: contact.notes
          });
          contactsCreated++;
        }
      } else {
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
          notes: contact.notes
        });
        contactsCreated++;
      }
    }
    return json({ success: true, contactsCreated, offersCreated });
  } catch (err) {
    console.error("Import error:", err);
    return json(
      { error: err instanceof Error ? err.message : "Erreur lors de l'import" },
      { status: 500 }
    );
  }
};
function normalizeLinkedInUrl(url) {
  if (!url) return url;
  if (url.startsWith("http")) return url;
  if (url.startsWith("linkedin.com")) return `https://${url}`;
  if (url.startsWith("www.linkedin.com")) return `https://${url}`;
  return url;
}
export {
  POST
};
