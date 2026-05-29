import { chatComplete, CLAUDE_FAST_MODEL, hasAnthropicKey } from "$lib/server/aiChat";
import type { PersonalizationSignal } from "./types";

/** Angle d'accroche extrait du texte de l'offre (sans web search). */
export async function fetchOfferContextSignal(params: {
  companyName: string;
  offerTitle: string;
  offerExcerpt?: string;
}): Promise<PersonalizationSignal | null> {
  if (!hasAnthropicKey() || !params.offerExcerpt || params.offerExcerpt.length < 40) {
    return null;
  }

  try {
    const hookText = await chatComplete({
      model: CLAUDE_FAST_MODEL,
      temperature: 0.2,
      maxTokens: 120,
      systemPrompt: `Tu extrais un angle d'accroche pour un cold email de recrutement.
Utilise UNIQUEMENT les faits présents dans le texte de l'offre — n'invente rien sur l'entreprise.
Réponds en 1-2 phrases factuelles, ou exactement "rien de trouvé" si le texte ne permet pas un angle concret.`,
      userPrompt: `Entreprise : ${params.companyName}
Poste : ${params.offerTitle || "poste"}

Texte de l'offre :
${params.offerExcerpt.slice(0, 600)}`,
    });

    if (!hookText || hookText.toLowerCase() === "rien de trouvé") return null;

    return {
      type: "company_news",
      text: hookText,
      source: "offer_analysis",
      confidence: "medium",
    };
  } catch {
    return null;
  }
}
