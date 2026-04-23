/**
 * Confirm the real full name of a LinkedIn profile via a web search.
 *
 * Used as a last-resort fallback when:
 *   1. Unipile returned a "name" that is clearly a job title
 *      (e.g. "Account Executive", "LinkedIn Member"), AND
 *   2. The slug-derived name is weak (single token, generic, truncated).
 *
 * Cost-aware: this hits the OpenAI web-search tool, so callers should only
 * invoke it for contacts where the cheaper heuristics have already failed.
 *
 * Returns `null` when nothing confident can be extracted — the caller should
 * keep whatever fallback it already had (slug-derived name or the original).
 */

import OpenAI from "openai";
import { env } from "$env/dynamic/private";

export type ResolvedName = {
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  source: "web_search";
};

export async function resolveLinkedInNameViaWebSearch(opts: {
  linkedinUrl: string;
  companyName?: string | null;
  jobTitle?: string | null;
  /** Optional existing guess (slug-derived) — used as a hint only. */
  hint?: string | null;
}): Promise<ResolvedName | null> {
  if (!env.OPENAI_API_KEY) return null;
  if (!opts.linkedinUrl) return null;

  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const contextLines = [
    `URL LinkedIn : ${opts.linkedinUrl}`,
    opts.companyName ? `Entreprise : ${opts.companyName}` : null,
    opts.jobTitle ? `Poste affiché : ${opts.jobTitle}` : null,
    opts.hint ? `Indice (potentiellement approximatif) : ${opts.hint}` : null,
  ].filter(Boolean);

  const prompt = `Tu es un assistant qui identifie le VRAI nom d'une personne à partir de son URL LinkedIn.

${contextLines.join("\n")}

Fais une recherche web pour trouver le prénom et le nom de famille de cette personne.
Sources acceptables : LinkedIn (profil public), site de l'entreprise, articles de presse, annuaires pro.

Réponds STRICTEMENT en JSON valide, sans markdown, sans commentaire, avec ce schéma :
{"firstName": "Prénom", "lastName": "Nom", "confidence": "high" | "medium" | "low"}

Règles :
- Si tu n'es pas sûr à >= 70 %, renvoie {"firstName": null, "lastName": null, "confidence": "low"}.
- "firstName" = prénom seul (sans particule ni titre).
- "lastName" = nom(s) de famille (inclure les particules "de", "van", "von" si présentes).
- Pas de titres ("M.", "Mme", "Dr"), pas de suffixes ("PhD", "CEO"), pas d'emojis.
- Si la page LinkedIn est visible mais retourne "LinkedIn Member" ou un titre de poste, considère cela comme non-trouvé.`;

  try {
    // Note: the `responses` API with `web_search_preview` is the same surface
    // already used in `generate-message/+server.ts`.
    const response = await (openai as unknown as {
      responses: {
        create: (args: {
          model: string;
          tools: { type: string }[];
          input: string;
        }) => Promise<{ output_text?: string }>;
      };
    }).responses.create({
      model: "gpt-4o-mini",
      tools: [{ type: "web_search_preview" }],
      input: prompt,
    });

    const raw = response.output_text?.trim() ?? "";
    if (!raw) return null;

    // Be generous: strip markdown code fences if the model added any.
    const jsonText = raw
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();

    let parsed: {
      firstName?: string | null;
      lastName?: string | null;
      confidence?: "high" | "medium" | "low";
    };
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return null;
    }

    if (parsed.confidence === "low") return null;

    const firstName = (parsed.firstName ?? "").toString().trim() || null;
    const lastName = (parsed.lastName ?? "").toString().trim() || null;
    if (!firstName && !lastName) return null;

    const fullName = [firstName, lastName].filter(Boolean).join(" ") || null;
    return { firstName, lastName, fullName, source: "web_search" };
  } catch (err) {
    console.warn("[resolveLinkedInName] web search failed:", err);
    return null;
  }
}
