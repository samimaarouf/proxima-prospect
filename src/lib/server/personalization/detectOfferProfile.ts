import type { OfferRoleFamily } from "./types";

export type HeuristicOfferProfile = {
  roleFamily: OfferRoleFamily;
  confidence: "high" | "medium" | "low";
  matchedTerms: string[];
};

type FamilyRule = {
  family: OfferRoleFamily;
  patterns: RegExp[];
  weight: number;
};

const FAMILY_RULES: FamilyRule[] = [
  {
    family: "sales",
    weight: 3,
    patterns: [
      /\b(commercial|commercial(?:e|aux)?|sales|business developer|account executive|account manager|chargé(?:e)? d'affaires|business development|sdr|bdr|closer|key account|directeur commercial|head of sales|vp sales|revenue)\b/i,
    ],
  },
  {
    family: "data",
    weight: 3,
    patterns: [
      /\b(data|analyst|analytics|analyste|bi\b|business intelligence|sql|power bi|tableau|data engineer|data scientist|actuaire|actuariat|assurance|underwriting|contrôle qualité|data quality|reporting)\b/i,
    ],
  },
  {
    family: "tech",
    weight: 3,
    patterns: [
      /\b(développeur|developer|devops|software|engineer|ingénieur|fullstack|frontend|backend|architecte|sre|cloud|cyber|it\b|tech lead|cto)\b/i,
    ],
  },
  {
    family: "product",
    weight: 2,
    patterns: [/\b(product owner|product manager|chef de produit|pm\b|po\b|product lead|cpo)\b/i],
  },
  {
    family: "marketing",
    weight: 2,
    patterns: [
      /\b(marketing|growth|seo|sem|content|brand|communication|acquisition|cmo|demand gen)\b/i,
    ],
  },
  {
    family: "finance",
    weight: 2,
    patterns: [
      /\b(finance|financial|controller|contrôleur|comptable|accounting|cfo|trésorerie|audit|fp&a)\b/i,
    ],
  },
  {
    family: "hr",
    weight: 2,
    patterns: [
      /\b(rh\b|hr\b|talent|recruteur|recruitment|people|ressources humaines|drh|chro)\b/i,
    ],
  },
  {
    family: "operations",
    weight: 2,
    patterns: [/\b(opérations|operations|supply chain|logistique|ops\b|coo|office manager)\b/i],
  },
];

function collectMatches(text: string, pattern: RegExp): string[] {
  const matches: string[] = [];
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    matches.push(m[0].toLowerCase());
  }
  return matches;
}

export function detectOfferProfileHeuristic(
  offerTitle: string,
  offerExcerpt = "",
): HeuristicOfferProfile {
  const haystack = `${offerTitle} ${offerExcerpt}`.trim();
  if (!haystack) {
    return { roleFamily: "generic", confidence: "low", matchedTerms: [] };
  }

  const scores = new Map<OfferRoleFamily, { score: number; terms: string[] }>();

  for (const rule of FAMILY_RULES) {
    const terms: string[] = [];
    for (const pattern of rule.patterns) {
      terms.push(...collectMatches(haystack, pattern));
    }
    if (terms.length === 0) continue;

    const prev = scores.get(rule.family) ?? { score: 0, terms: [] };
    scores.set(rule.family, {
      score: prev.score + rule.weight * terms.length,
      terms: [...prev.terms, ...terms],
    });
  }

  if (scores.size === 0) {
    return { roleFamily: "generic", confidence: "low", matchedTerms: [] };
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1].score - a[1].score);
  const [topFamily, top] = ranked[0];
  const secondScore = ranked[1]?.[1].score ?? 0;

  let confidence: HeuristicOfferProfile["confidence"] = "medium";
  if (top.score >= 6 && top.score >= secondScore * 1.5) confidence = "high";
  else if (top.score <= 2 || top.score - secondScore <= 1) confidence = "low";

  return {
    roleFamily: topFamily,
    confidence,
    matchedTerms: [...new Set(top.terms)].slice(0, 8),
  };
}
