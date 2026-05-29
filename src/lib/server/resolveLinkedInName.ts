/**
 * Infer a LinkedIn profile full name from URL slug + context when Unipile
 * returns unreliable data (job title instead of name, etc.).
 *
 * Uses Claude on the available context only — no live web search.
 * Returns `null` when confidence is too low.
 */

import { chatCompleteJson, CLAUDE_FAST_MODEL, hasAnthropicKey } from "$lib/server/aiChat";

export type ResolvedName = {
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  source: "inference";
};

type NameJson = {
  firstName?: string | null;
  lastName?: string | null;
  confidence?: "high" | "medium" | "low";
};

export async function resolveLinkedInNameViaWebSearch(opts: {
  linkedinUrl: string;
  companyName?: string | null;
  jobTitle?: string | null;
  hint?: string | null;
}): Promise<ResolvedName | null> {
  if (!hasAnthropicKey()) return null;
  if (!opts.linkedinUrl) return null;

  const contextLines = [
    `URL LinkedIn : ${opts.linkedinUrl}`,
    opts.companyName ? `Entreprise : ${opts.companyName}` : null,
    opts.jobTitle ? `Poste affiché : ${opts.jobTitle}` : null,
    opts.hint ? `Indice (potentiellement approximatif) : ${opts.hint}` : null,
  ].filter(Boolean);

  try {
    const parsed = await chatCompleteJson<NameJson>({
      model: CLAUDE_FAST_MODEL,
      temperature: 0,
      maxTokens: 120,
      systemPrompt: `Tu déduis le nom probable d'une personne à partir de son URL LinkedIn et du contexte fourni.
N'invente pas un nom plausible au hasard — base-toi sur le slug URL et les indices.
JSON : {"firstName": "...", "lastName": "...", "confidence": "high"|"medium"|"low"}
Si incertain (< 70 %), confidence = "low" et firstName/lastName = null.`,
      userPrompt: contextLines.join("\n"),
    });

    if (parsed.confidence === "low") return null;

    const firstName = (parsed.firstName ?? "").toString().trim() || null;
    const lastName = (parsed.lastName ?? "").toString().trim() || null;
    if (!firstName && !lastName) return null;

    const fullName = [firstName, lastName].filter(Boolean).join(" ") || null;
    return { firstName, lastName, fullName, source: "inference" };
  } catch (err) {
    console.warn("[resolveLinkedInName] inference failed:", err);
    return null;
  }
}
