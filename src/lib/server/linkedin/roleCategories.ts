export const ROLE_CATEGORIES = {
  founder_ceo: {
    label: "Fondateur / CEO",
    keywords: [
      "Founder",
      "Co-Founder",
      "CEO",
      "Co-Founder & CEO",
      "Président",
      "Dirigeant",
      "Gérant",
      "Managing Director",
      "Directeur Général",
      "DG",
    ],
  },
  sales: {
    label: "Direction Commerciale",
    keywords: [
      "Head of Sales",
      "Sales Manager",
      "Responsable commercial",
      "Directeur commercial",
      "VP Sales",
      "Chief Revenue Officer",
      "CRO",
      "Head of Revenue",
      "Revenue Manager",
    ],
  },
  coo: {
    label: "Direction des Opérations",
    keywords: [
      "COO",
      "Chief Operating Officer",
      "Head of Operations",
      "Directeur des opérations",
      "Responsable opérations",
      "Operations Manager",
      "Chief of Staff",
    ],
  },
  hr: {
    label: "RH / Recrutement",
    keywords: [
      "Head of People",
      "People Manager",
      "HR Manager",
      "Human Resources Manager",
      "Responsable RH",
      "Responsable Ressources Humaines",
      "Talent Acquisition Manager",
      "Recruitment Manager",
      "Responsable recrutement",
    ],
  },
} as const;

export type RoleCategoryKey = keyof typeof ROLE_CATEGORIES;

/** @deprecated Use ROLE_CATEGORIES */
export const _ROLE_CATEGORIES = ROLE_CATEGORIES;
