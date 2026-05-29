import { detectOfferProfileHeuristic } from "./detectOfferProfile";
import { analyzeOfferProposition } from "./offerPropositionAgent";
import type { OfferProposition, OfferRoleFamily } from "./types";

const TEMPLATE_BRIEFS: Record<
  OfferRoleFamily,
  { specialty: string; brief: string; avoid: string[] }
> = {
  sales: {
    specialty: "profils commerciaux B2B",
    brief:
      "- Recrutement commercial en cours\n- Candidats alignés ICP / cycle de vente\n- Validation de l'intérêt candidat avant présentation\n- Proposer un échange ou envoi de profils concrets",
    avoid: [],
  },
  data: {
    specialty: "profils data et analystes métier",
    brief:
      "- Poste data / analyse métier\n- Profils opérationnels sur l'environnement technique et réglementaire\n- Pré-validation candidat avant mise en relation\n- Proposer un échange ou exemples de profils",
    avoid: ["cycle de vente", "quota commercial", "profils commerciaux", "profils sales"],
  },
  tech: {
    specialty: "profils tech et ingénierie",
    brief:
      "- Poste technique identifié\n- Profils alignés stack et contraintes produit\n- Candidats pré-validés sur leur intérêt\n- Proposer un échange rapide",
    avoid: ["cycle de vente", "quota commercial"],
  },
  product: {
    specialty: "profils product",
    brief:
      "- Recrutement product en cours\n- Profils adaptés au contexte marché et orga\n- Validation amont côté candidat\n- Proposer un échange",
    avoid: ["cycle de vente", "quota commercial"],
  },
  marketing: {
    specialty: "profils marketing et growth",
    brief:
      "- Poste marketing / growth\n- Profils alignés canaux et objectifs\n- Candidats pré-validés\n- Proposer un échange",
    avoid: ["cycle de vente", "quota commercial"],
  },
  finance: {
    specialty: "profils finance et contrôle de gestion",
    brief:
      "- Poste finance / contrôle\n- Profils adaptés structure et enjeux de pilotage\n- Validation amont candidat\n- Proposer un échange",
    avoid: ["cycle de vente", "quota commercial"],
  },
  hr: {
    specialty: "profils RH et talent acquisition",
    brief:
      "- Recrutement RH / talent\n- Profils adaptés organisation et priorités\n- Candidats pré-validés\n- Proposer un échange",
    avoid: ["cycle de vente", "quota commercial"],
  },
  operations: {
    specialty: "profils opérations",
    brief:
      "- Poste opérations\n- Profils intégrables rapidement aux process\n- Validation amont\n- Proposer un échange",
    avoid: ["cycle de vente", "quota commercial"],
  },
  generic: {
    specialty: "profils adaptés au besoin",
    brief:
      "- Recrutement en cours sur ce poste\n- Candidats alignés besoin et contexte\n- Validation amont\n- Proposer un échange",
    avoid: ["cycle de vente"],
  },
};

function fromTemplate(
  family: OfferRoleFamily,
  confidence: OfferProposition["confidence"],
): OfferProposition {
  const tpl = TEMPLATE_BRIEFS[family];
  return {
    roleFamily: family,
    recruiterSpecialty: tpl.specialty,
    writerBrief: tpl.brief,
    keywordsToUse: [],
    termsToAvoid: tpl.avoid,
    confidence,
    source: "heuristic",
  };
}

export async function resolveOfferProposition(params: {
  companyName: string;
  offerTitle: string;
  offerExcerpt: string;
  offerLocation?: string | null;
  pitch: string;
}): Promise<OfferProposition> {
  const heuristic = detectOfferProfileHeuristic(params.offerTitle, params.offerExcerpt);

  const agentResult = await analyzeOfferProposition({
    companyName: params.companyName,
    offerTitle: params.offerTitle,
    offerExcerpt: params.offerExcerpt,
    offerLocation: params.offerLocation,
    pitch: params.pitch,
    heuristicFamily: heuristic.roleFamily,
    heuristicTerms: heuristic.matchedTerms,
  });
  if (agentResult) return agentResult;

  return fromTemplate(heuristic.roleFamily, heuristic.confidence);
}
