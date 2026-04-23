/**
 * Alternative décisionnaires-finder that uses the OpenAI web search tool to
 * dig up LinkedIn profiles instead of querying Coresignal. Useful when:
 *   - Coresignal has no coverage for the company.
 *   - All Coresignal keys are exhausted.
 *   - You want to prospect tiny / niche boîtes.
 *
 * Strategy: we ask the model to run a Google-like query of the form
 *   site:linkedin.com/in "<role>" "<company>" <location>
 * and return a small JSON array of candidates. We then normalise the LinkedIn
 * URLs and dedupe against each other.
 *
 * Returns the same shape as /find-decision-makers so the UI can reuse the
 * selection + add-contact flow without a single change.
 */
import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { prospectOffer } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import OpenAI from "openai";
import { OPENAI_API_KEY } from "$env/static/private";
import { _ROLE_CATEGORIES, type RoleCategoryKey } from "../find-decision-makers/+server";
import { normalizeLinkedInUrl } from "$lib/linkedinUrl";
import type { RequestHandler } from "./$types";

type WebCandidate = {
  fullName: string;
  jobTitle: string;
  linkedinUrl: string;
  email: string | null;
  location: string | null;
  pictureUrl: string | null;
};

function cleanCompanyName(name: string): string {
  return name
    .replace(/\s*\|.*$/, "")
    .replace(/\s*[–—]\s.*$/, "")
    .replace(/\s+-\s+.+$/, "")
    .replace(/\s*\(.*?\)/g, "")
    .replace(/\s*\b(SAS|SARL|SA|SNC|SASU|EI|EURL|SCP|GIE)\b\s*$/i, "")
    .trim();
}

export const POST: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) return json({ error: "Non authentifié" }, { status: 401 });
  if (!OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY non configurée" }, { status: 500 });

  const [offer] = await db.select().from(prospectOffer).where(eq(prospectOffer.id, params.id)).limit(1);
  if (!offer) return json({ error: "Offre introuvable" }, { status: 404 });

  const { roles } = (await request.json()) as { roles: RoleCategoryKey[] };
  if (!roles?.length) return json({ error: "Aucun rôle sélectionné" }, { status: 400 });

  const company = cleanCompanyName(offer.companyName);
  const location = offer.offerLocation?.trim() || null;

  // Expand roles to labels + keywords for the prompt.
  const roleBlocks = roles
    .map((r) => {
      const cat = _ROLE_CATEGORIES[r];
      if (!cat) return null;
      return `- ${cat.label} (mots-clés acceptables : ${cat.keywords.slice(0, 8).join(", ")})`;
    })
    .filter(Boolean)
    .join("\n");

  const prompt = `Tu es un expert de la prospection B2B. Tu dois retrouver sur LinkedIn les décisionnaires actuels de l'entreprise ciblée en faisant une recherche Google.

Entreprise cible : ${company}${offer.offerUrl ? ` (site : ${offer.offerUrl})` : ""}
${location ? `Localisation souhaitée : ${location}` : ""}

Catégories de rôles recherchés :
${roleBlocks}

Instructions :
1. Fais une recherche Google du type : site:linkedin.com/in "${company}" "<mot-clé de rôle>"${location ? ` "${location}"` : ""}
2. Ne retiens que les profils dont l'entreprise ACTUELLE est "${company}" (ou une variante évidente).
3. Ne retiens que les profils dont le poste actuel correspond aux mots-clés ci-dessus.
4. Exclus les recruteurs externes, les consultants, les anciens employés.
5. Ramène au maximum 10 profils, triés par pertinence.

Réponds STRICTEMENT en JSON valide (pas de markdown, pas de commentaire) avec ce schéma :
{
  "candidates": [
    {
      "fullName": "Prénom Nom",
      "jobTitle": "Titre exact vu sur LinkedIn",
      "linkedinUrl": "https://www.linkedin.com/in/slug",
      "location": "Ville, Pays" | null
    }
  ]
}

Si aucun résultat fiable : {"candidates": []}.`;

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  let rawText = "";
  try {
    const response = await (openai as unknown as {
      responses: {
        create: (a: {
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
    rawText = (response.output_text ?? "").trim();
  } catch (err) {
    console.error("[find-decision-makers-web] openai failed:", err);
    return json(
      { error: err instanceof Error ? err.message : "La recherche web a échoué" },
      { status: 502 },
    );
  }

  if (!rawText) return json({ candidates: [] });

  // Be tolerant: strip optional markdown fences, then pull out the first JSON
  // object from the response.
  const jsonText = rawText
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const firstBrace = jsonText.indexOf("{");
  const lastBrace = jsonText.lastIndexOf("}");
  const jsonSlice = firstBrace >= 0 && lastBrace > firstBrace ? jsonText.slice(firstBrace, lastBrace + 1) : jsonText;

  let parsed: { candidates?: Array<{
    fullName?: string;
    jobTitle?: string;
    linkedinUrl?: string;
    location?: string | null;
  }> };
  try {
    parsed = JSON.parse(jsonSlice);
  } catch (err) {
    console.warn("[find-decision-makers-web] JSON parse failed; raw:", rawText.slice(0, 500), err);
    return json({ candidates: [] });
  }

  const seen = new Set<string>();
  const candidates: WebCandidate[] = [];
  for (const raw of parsed.candidates ?? []) {
    const linkedinUrl = normalizeLinkedInUrl(raw.linkedinUrl ?? null);
    if (!linkedinUrl) continue;
    if (seen.has(linkedinUrl)) continue;
    seen.add(linkedinUrl);

    const fullName = (raw.fullName ?? "").toString().trim();
    const jobTitle = (raw.jobTitle ?? "").toString().trim();
    if (!fullName) continue;

    candidates.push({
      fullName,
      jobTitle,
      linkedinUrl,
      email: null,
      location: (raw.location ?? null) || null,
      pictureUrl: null,
    });
  }

  console.log(
    `[find-decision-makers-web] ${candidates.length} candidate(s) for "${company}"${location ? ` @ ${location}` : ""}`,
  );

  return json({ candidates });
};
