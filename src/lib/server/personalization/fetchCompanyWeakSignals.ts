import { chatWithWebSearchJson, CLAUDE_FAST_MODEL, hasAnthropicKey } from "$lib/server/aiChat";
import type { PersonalizationSignal } from "./types";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const weakSignalCache = new Map<
  string,
  { signals: PersonalizationSignal[]; expiresAt: number }
>();

function cacheKey(companyName: string, offerTitle: string): string {
  return `${companyName.trim().toLowerCase()}::${offerTitle.trim().toLowerCase()}`;
}

type WeakSignalJson = {
  signals?: Array<{
    text?: string;
    confidence?: "high" | "medium" | "low" | string;
  }>;
};

function normalizeConfidence(raw?: string): PersonalizationSignal["confidence"] {
  if (raw === "high" || raw === "medium" || raw === "low") return raw;
  return "low";
}

/**
 * Signaux faibles entreprise via web search Claude :
 * croissance, levée, expansion, recrutements multiples, actualité récente.
 * Cached 24h par entreprise + poste.
 */
export async function fetchCompanyWeakSignals(params: {
  companyName: string;
  offerTitle: string;
  offerLocation?: string | null;
  offerExcerpt?: string;
}): Promise<PersonalizationSignal[]> {
  const key = cacheKey(params.companyName, params.offerTitle);
  const cached = weakSignalCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.signals;
  }

  if (!hasAnthropicKey()) {
    weakSignalCache.set(key, { signals: [], expiresAt: Date.now() + CACHE_TTL_MS });
    return [];
  }

  let signals: PersonalizationSignal[] = [];

  try {
    const parsed = await chatWithWebSearchJson<WeakSignalJson>({
      model: CLAUDE_FAST_MODEL,
      maxSearchUses: 2,
      maxTokens: 350,
      temperature: 0.1,
      systemPrompt: `Tu es un analyste business. Tu identifies des signaux faibles sur une entreprise pour contextualiser un recrutement.
Utilise la recherche web. N'invente rien : chaque signal doit être vérifiable via une source trouvée.
Signaux faibles = indices indirects mais utiles : croissance, levée, expansion, nouveaux produits, recrutements groupés, pivot, actualité sectorielle.`,
      userPrompt: `Entreprise : ${params.companyName}
Poste recruté : ${params.offerTitle}
${params.offerLocation ? `Localisation : ${params.offerLocation}` : ""}
${params.offerExcerpt ? `Extrait offre (contexte interne) :\n${params.offerExcerpt.slice(0, 350)}` : ""}

Cherche 0 à 2 signaux faibles RÉCENTS (< 12 mois) qui expliqueraient POURQUOI cette entreprise recrute ce profil.

JSON strict :
{"signals":[{"text":"1 phrase factuelle et datée si possible","confidence":"high"|"medium"|"low"}]}

Si rien de vérifiable en ligne : {"signals":[]}`,
    });

    const mapped: PersonalizationSignal[] = [];
    for (const s of parsed.signals ?? []) {
      const text = s.text?.trim();
      if (!text || text.length < 15) continue;
      mapped.push({
        type: "company_weak_signal",
        text: text.slice(0, 280),
        source: "web_search",
        confidence: normalizeConfidence(s.confidence),
      });
    }
    signals = mapped.slice(0, 2);
  } catch (err) {
    console.warn("[fetchCompanyWeakSignals] web search failed:", err);
  }

  weakSignalCache.set(key, { signals, expiresAt: Date.now() + CACHE_TTL_MS });
  return signals;
}
