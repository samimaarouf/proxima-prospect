export type PersonalizationSignalType =
  | "offer_detail"
  | "company_news"
  | "company_weak_signal"
  | "contact_post"
  | "contact_profile"
  | "offer_page";

export type PersonalizationSignal = {
  type: PersonalizationSignalType;
  text: string;
  source: string;
  confidence: "high" | "medium" | "low";
  freshnessDays?: number;
};

export type ContactSegment =
  | "founder_ceo"
  | "sales_leader"
  | "hr_talent"
  | "generic_decision_maker";

export type OfferRoleFamily =
  | "sales"
  | "data"
  | "tech"
  | "product"
  | "marketing"
  | "finance"
  | "hr"
  | "operations"
  | "generic";

export type OfferProposition = {
  roleFamily: OfferRoleFamily;
  recruiterSpecialty: string;
  /** Brief interne pour l'agent rédacteur — pas du texte à copier-coller */
  writerBrief: string;
  keywordsToUse: string[];
  termsToAvoid: string[];
  confidence: "high" | "medium" | "low";
  source: "heuristic" | "agent";
};

export type PersonalizationContext = {
  recruiterName: string;
  recruiterFirstName: string;
  recruiterCompany: string;

  contactFirstName: string;
  contactFullName: string;
  contactJobTitle: string;
  linkedinSummary: string;

  companyName: string;
  offerTitle: string;
  offerTitleClean: string;
  offerLocation: string | null;
  offerUrl: string | null;
  offerExcerpt: string;

  pitch: string;

  offerProposition: OfferProposition;

  signals: PersonalizationSignal[];
  segment: ContactSegment;
  qualityScore: number;
};

export type PersonalizationMeta = {
  qualityScore: number;
  segment: ContactSegment;
  roleFamily: OfferRoleFamily;
  offerPropositionSource: OfferProposition["source"];
  styleVariant?: string;
  signalsUsed: PersonalizationSignalType[];
  warnings: string[];
};
