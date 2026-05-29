import { chatCompleteJson, CLAUDE_FAST_MODEL, hasAnthropicKey } from "$lib/server/aiChat";
import type { OfferProposition, OfferRoleFamily } from "./types";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const propositionCache = new Map<string, { value: OfferProposition; expiresAt: number }>();

const VALID_FAMILIES: OfferRoleFamily[] = [
  "sales",
  "data",
  "tech",
  "product",
  "marketing",
  "finance",
  "hr",
  "operations",
  "generic",
];

function cacheKey(params: {
  companyName: string;
  offerTitle: string;
  offerExcerpt: string;
  pitch: string;
}): string {
  return [
    params.companyName.trim().toLowerCase(),
    params.offerTitle.trim().toLowerCase(),
    params.offerExcerpt.slice(0, 400),
    params.pitch.slice(0, 200),
  ].join("::");
}

type AgentJson = {
  roleFamily?: OfferRoleFamily;
  recruiterSpecialty?: string;
  writerBrief?: string;
  valueProposition?: string;
  keywordsToUse?: string[];
  termsToAvoid?: string[];
};

function parseAgentResponse(parsed: AgentJson): Partial<OfferProposition> | null {
  const roleFamily = parsed.roleFamily;
  if (!roleFamily || !VALID_FAMILIES.includes(roleFamily)) return null;

  const writerBrief = String(parsed.writerBrief || parsed.valueProposition || "").trim();
  const recruiterSpecialty = String(parsed.recruiterSpecialty || "").trim();
  if (!writerBrief || !recruiterSpecialty) return null;

  return {
    roleFamily,
    recruiterSpecialty,
    writerBrief,
    keywordsToUse: Array.isArray(parsed.keywordsToUse)
      ? parsed.keywordsToUse.map(String).filter(Boolean).slice(0, 8)
      : [],
    termsToAvoid: Array.isArray(parsed.termsToAvoid)
      ? parsed.termsToAvoid.map(String).filter(Boolean).slice(0, 8)
      : [],
    confidence: "high",
    source: "agent",
  };
}

/**
 * Agent analyste offre : produit un brief métier (pas du copy-paste)
 * pour guider l'agent cold email.
 */
export async function analyzeOfferProposition(params: {
  companyName: string;
  offerTitle: string;
  offerExcerpt: string;
  offerLocation?: string | null;
  pitch: string;
  heuristicFamily: OfferRoleFamily;
  heuristicTerms: string[];
}): Promise<OfferProposition | null> {
  const key = cacheKey(params);
  const cached = propositionCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  if (!hasAnthropicKey()) return null;

  try {
    const parsed = await chatCompleteJson<AgentJson>({
      model: CLAUDE_FAST_MODEL,
      temperature: 0.2,
      maxTokens: 450,
      systemPrompt: `Tu analyses une offre d'emploi pour préparer un cold email de recruteur.
Tu ne rédiges PAS l'email — tu produis un brief interne pour un autre agent rédacteur.

Règles :
- roleFamily = vrai métier du poste (pas toujours "sales")
- writerBrief = 3-5 puces courtes (FOND à transmettre, pas de phrases toutes faites)
- recruiterSpecialty = comment le recruteur se positionne sur CE type de poste
- termsToAvoid = termes hors-sujet (ex: "cycle de vente" pour un poste data)
- keywordsToUse = 3-6 mots métier de l'offre

JSON :
{
  "roleFamily": "sales|data|tech|product|marketing|finance|hr|operations|generic",
  "recruiterSpecialty": "...",
  "writerBrief": "- puce 1\\n- puce 2",
  "keywordsToUse": ["..."],
  "termsToAvoid": ["..."]
}`,
      userPrompt: `Entreprise : ${params.companyName}
Poste : ${params.offerTitle}
${params.offerLocation ? `Localisation : ${params.offerLocation}` : ""}
Hypothèse : ${params.heuristicFamily} (${params.heuristicTerms.join(", ") || "aucun terme"})
Pitch campagne : ${params.pitch || "(non défini)"}

Contenu offre :
${params.offerExcerpt || "(titre seulement)"}`,
    });

    const result = parseAgentResponse(parsed);
    if (!result?.writerBrief || !result.recruiterSpecialty) return null;

    const value: OfferProposition = {
      roleFamily: result.roleFamily ?? params.heuristicFamily,
      recruiterSpecialty: result.recruiterSpecialty,
      writerBrief: result.writerBrief,
      keywordsToUse: result.keywordsToUse ?? [],
      termsToAvoid: result.termsToAvoid ?? [],
      confidence: result.confidence ?? "high",
      source: "agent",
    };

    propositionCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  } catch (err) {
    console.warn("[offerPropositionAgent] analyze failed:", err);
    return null;
  }
}
