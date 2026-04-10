import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { prospectOffer, user } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import OpenAI from "openai";
import { OPENAI_API_KEY } from "$env/static/private";
import type { RequestHandler } from "./$types";

export const _ROLE_CATEGORIES = {
  founder_ceo: {
    label: "Fondateur / CEO",
    keywords: ["Founder", "Co-Founder", "CEO", "Co-Founder & CEO", "Président", "Dirigeant", "Gérant", "Managing Director", "Directeur Général", "DG"],
  },
  sales: {
    label: "Direction Commerciale",
    keywords: ["Head of Sales", "Sales Manager", "Responsable commercial", "Directeur commercial", "VP Sales", "Chief Revenue Officer", "CRO", "Head of Revenue", "Revenue Manager"],
  },
  coo: {
    label: "Direction des Opérations",
    keywords: ["COO", "Chief Operating Officer", "Head of Operations", "Directeur des opérations", "Responsable opérations", "Operations Manager", "Chief of Staff"],
  },
  hr: {
    label: "RH / Recrutement",
    keywords: ["Head of People", "People Manager", "HR Manager", "Human Resources Manager", "Responsable RH", "Responsable Ressources Humaines", "Talent Acquisition Manager", "Recruitment Manager", "Responsable recrutement"],
  },
} as const;

export type RoleCategoryKey = keyof typeof _ROLE_CATEGORIES;

function extractDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

async function coresignalSearch(apiKey: string, query: object): Promise<number[]> {
  const res = await fetch(
    "https://api.coresignal.com/cdapi/v2/employee_multi_source/search/es_dsl",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ query, sort: ["_score"] }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Coresignal search ${res.status}: ${err}`);
  }
  const ids: number[] = await res.json();
  return ids;
}

async function coresignalCollect(apiKey: string, id: number): Promise<Record<string, unknown>> {
  const res = await fetch(
    `https://api.coresignal.com/cdapi/v2/employee_multi_source/collect/${id}`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json", apikey: apiKey },
    }
  );
  if (!res.ok) throw new Error(`Coresignal collect ${id}: ${res.status}`);
  return await res.json();
}

export const POST: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) return json({ error: "Non authentifié" }, { status: 401 });

  const [profile] = await db
    .select({ coresignalApiKey: user.coresignalApiKey })
    .from(user)
    .where(eq(user.id, locals.user.id))
    .limit(1);

  if (!profile?.coresignalApiKey) {
    return json({ error: "Clé API Coresignal non configurée. Rendez-vous dans Paramètres." }, { status: 400 });
  }

  const [offer] = await db.select().from(prospectOffer).where(eq(prospectOffer.id, params.id)).limit(1);
  if (!offer) return json({ error: "Offre introuvable" }, { status: 404 });

  const { roles } = (await request.json()) as { roles: RoleCategoryKey[] };
  if (!roles?.length) return json({ error: "Aucun rôle sélectionné" }, { status: 400 });

  const domain = extractDomain(offer.offerUrl);

  // ── 1. Build ES query ──────────────────────────────────────────
  const companyFilter = domain
    ? {
        nested: {
          path: "experience",
          query: {
            bool: {
              must: [
                { term: { "experience.active_experience": 1 } },
                { match: { "experience.company_website.domain_only": domain } },
              ],
            },
          },
        },
      }
    : {
        nested: {
          path: "experience",
          query: {
            bool: {
              must: [
                { term: { "experience.active_experience": 1 } },
                { match: { "experience.company_name": offer.companyName } },
              ],
            },
          },
        },
      };

  const esQuery = {
    bool: {
      must: [companyFilter],
    },
  };

  // ── 2. Search → get IDs ────────────────────────────────────────
  let ids: number[] = [];
  try {
    ids = await coresignalSearch(profile.coresignalApiKey, esQuery);
  } catch (err) {
    console.error("Coresignal search failed:", err);
    return json({ error: String(err) }, { status: 502 });
  }

  if (!ids.length) return json({ candidates: [] });

  // Limit to 20 collects to preserve credits
  const idsToCollect = ids.slice(0, 20);

  // ── 3. Collect each employee ──────────────────────────────────
  const employees: Array<{
    full_name?: string;
    active_experience_title?: string;
    professional_network_url?: string;
    primary_professional_email?: string;
    location_full?: string;
  }> = [];

  await Promise.allSettled(
    idsToCollect.map(async (id) => {
      try {
        const data = await coresignalCollect(profile.coresignalApiKey!, id);
        employees.push(data as typeof employees[0]);
      } catch { /* skip failed collects */ }
    })
  );

  if (!employees.length) return json({ candidates: [] });

  // ── 4. AI classification ──────────────────────────────────────
  const selectedCategories = roles.map((r) => ({
    key: r,
    label: _ROLE_CATEGORIES[r].label,
    keywords: _ROLE_CATEGORIES[r].keywords,
  }));

  const validEmployees = employees.filter(
    (e) => e.full_name && e.active_experience_title
  );

  const employeeList = validEmployees
    .map((e, i) => `${i + 1}. ${e.full_name} — "${e.active_experience_title}"`)
    .join("\n");

  let matchIndices: number[] = [];

  try {
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Tu es un assistant de qualification B2B. Retourne les indices (1-based) des employés dont le poste correspond à au moins une catégorie cible. Réponds UNIQUEMENT en JSON : { "matches": [1, 3, 5] }`,
        },
        {
          role: "user",
          content: `Catégories :\n${selectedCategories.map((c) => `- ${c.label} : ${c.keywords.join(", ")}`).join("\n")}\n\nEmployés :\n${employeeList}`,
        },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
      max_tokens: 200,
    });
    const parsed = JSON.parse(completion.choices[0].message.content ?? "{}");
    matchIndices = (parsed.matches ?? []).filter((n: unknown) => typeof n === "number");
  } catch {
    // Fallback: keyword matching
    const allKeywords = selectedCategories.flatMap((c) =>
      c.keywords.map((k) => k.toLowerCase())
    );
    matchIndices = validEmployees
      .map((e, i) => {
        const title = (e.active_experience_title ?? "").toLowerCase();
        return allKeywords.some((kw) => title.includes(kw)) ? i + 1 : null;
      })
      .filter((n): n is number => n !== null);
  }

  // ── 5. Build response ─────────────────────────────────────────
  const candidates = matchIndices
    .map((idx) => validEmployees[idx - 1])
    .filter(Boolean)
    .map((e) => ({
      fullName: e.full_name,
      jobTitle: e.active_experience_title,
      linkedinUrl: e.professional_network_url || null,
      email: e.primary_professional_email || null,
      location: e.location_full || null,
    }));

  return json({ candidates });
};
