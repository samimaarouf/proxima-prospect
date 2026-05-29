import type { ContactSegment } from "./types";

const FOUNDER =
  /\b(fondateur|founder|ceo|pdg|président|president|co-founder|cofounder|dirigeant|gérant|gerant|managing director)\b/i;
const SALES =
  /\b(sales|commercial|revenue|croissance|business development|vp sales|directeur commercial|chief revenue|cro\b)\b/i;
const HR =
  /\b(rh\b|hr\b|talent|recrut|people ops|ressources humaines|chief people|drh\b)\b/i;

export function detectSegment(jobTitle: string, summary: string): ContactSegment {
  const hay = `${jobTitle} ${summary}`;
  if (FOUNDER.test(hay)) return "founder_ceo";
  if (SALES.test(hay)) return "sales_leader";
  if (HR.test(hay)) return "hr_talent";
  return "generic_decision_maker";
}
