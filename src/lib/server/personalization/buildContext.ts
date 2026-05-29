import type { prospectContact, prospectOffer } from "$lib/server/db/schema";
import { detectSegment } from "./detectSegment";
import { fetchCompanySignals } from "./fetchCompanySignals";
import { fetchLatestContactPost } from "./fetchContactPosts";
import { cleanOfferTitle } from "./prompts";
import { resolveOfferProposition } from "./resolveOfferProposition";
import { scoreSignals } from "./scoreSignals";
import type { PersonalizationContext, PersonalizationSignal } from "./types";

type ContactRow = typeof prospectContact.$inferSelect;
type OfferRow = typeof prospectOffer.$inferSelect;

function firstNameFromFullName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts[0] || "";
}

function buildOfferExcerpt(offer: OfferRow): PersonalizationSignal | null {
  const raw = offer.offerContent?.trim();
  if (!raw || raw.length < 40) return null;

  return {
    type: "offer_page",
    text: raw.slice(0, 500),
    source: "offerContent",
    confidence: "high",
  };
}

export async function buildPersonalizationContext(params: {
  contact: ContactRow;
  offer: OfferRow;
  pitch: string;
  recruiterName: string;
  recruiterFirstName: string;
  recruiterCompany: string;
  unipileLinkedInAccountId?: string | null;
  fetchPosts?: boolean;
}): Promise<PersonalizationContext> {
  const { contact, offer, pitch } = params;

  const contactFullName = contact.fullName || "le/la décideur(se)";
  const contactFirstName =
    firstNameFromFullName(contact.fullName || "") || "Madame/Monsieur";
  const contactJobTitle = contact.jobTitle || "";
  const linkedinSummary = contact.linkedinSummary || "";

  const offerTitleRaw = offer.offerTitle || contactJobTitle || "poste Sales";
  const offerTitleClean = cleanOfferTitle(offerTitleRaw);

  const signals: PersonalizationSignal[] = [];

  const offerExcerptSignal = buildOfferExcerpt(offer);
  const offerExcerpt = offerExcerptSignal?.text ?? "";
  if (offerExcerptSignal) signals.push(offerExcerptSignal);

  if (linkedinSummary.length > 50) {
    signals.push({
      type: "contact_profile",
      text: linkedinSummary.slice(0, 400),
      source: "linkedinSummary",
      confidence: "high",
    });
  }

  const companySignals = await fetchCompanySignals({
    companyName: offer.companyName,
    offerTitle: offerTitleClean,
    offerLocation: offer.offerLocation,
    offerExcerpt,
  });
  signals.push(...companySignals);

  const linkedinData = contact.linkedinData as Record<string, unknown> | null;
  const providerId =
    (linkedinData?.provider_id as string | undefined) ||
    (linkedinData?.providerId as string | undefined);

  if (params.fetchPosts !== false && params.unipileLinkedInAccountId && providerId) {
    const postSignal = await fetchLatestContactPost({
      accountId: params.unipileLinkedInAccountId,
      providerId,
    });
    if (postSignal) signals.push(postSignal);
  }

  const segment = detectSegment(contactJobTitle, linkedinSummary);

  const priority: Record<PersonalizationSignal["type"], number> = {
    contact_post: 0,
    company_news: 1,
    company_weak_signal: 2,
    offer_page: 3,
    offer_detail: 4,
    contact_profile: 5,
  };
  signals.sort((a, b) => priority[a.type] - priority[b.type]);

  const offerProposition = await resolveOfferProposition({
    companyName: offer.companyName,
    offerTitle: offerTitleClean,
    offerExcerpt,
    offerLocation: offer.offerLocation,
    pitch,
  });

  const base: Omit<PersonalizationContext, "qualityScore"> = {
    recruiterName: params.recruiterName,
    recruiterFirstName: params.recruiterFirstName,
    recruiterCompany: params.recruiterCompany,
    contactFirstName,
    contactFullName,
    contactJobTitle,
    linkedinSummary,
    companyName: offer.companyName,
    offerTitle: offerTitleRaw,
    offerTitleClean,
    offerLocation: offer.offerLocation,
    offerUrl: offer.offerUrl,
    offerExcerpt,
    pitch,
    offerProposition,
    signals,
    segment,
  };

  return {
    ...base,
    qualityScore: scoreSignals(base),
  };
}
