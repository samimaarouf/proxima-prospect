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

function cleanCompanyName(name: string): string {
  return name.replace(/\s*\(.*?\)/g, "").trim();
}

function coresignalFetchOptions(extra?: RequestInit): RequestInit & { signal: AbortSignal } {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 15_000);
  return { ...extra, signal: controller.signal };
}

function friendlyCoresignalError(status: number): string {
  if (status === 504 || status === 502 || status === 503) {
    return "Coresignal est temporairement indisponible (erreur " + status + "). Veuillez réessayer dans quelques minutes.";
  }
  if (status === 401 || status === 403) {
    return "Clé API Coresignal invalide ou expirée. Vérifiez vos paramètres.";
  }
  if (status === 429) {
    return "Limite de requêtes Coresignal atteinte. Attendez un moment avant de réessayer.";
  }
  return `Erreur Coresignal (${status}). Veuillez réessayer.`;
}

async function coresignalSearch(apiKey: string, query: object): Promise<number[]> {
  let res: Response;
  try {
    res = await fetch(
      "https://api.coresignal.com/cdapi/v2/employee_multi_source/search/es_dsl",
      coresignalFetchOptions({
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({ query, sort: ["_score"] }),
      })
    );
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("Coresignal n'a pas répondu dans les délais (timeout). Réessayez dans quelques instants.");
    }
    throw e;
  }
  if (!res.ok) {
    throw new Error(friendlyCoresignalError(res.status));
  }
  const ids: number[] = await res.json();
  return ids;
}

async function coresignalCollect(apiKey: string, id: number): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(
      `https://api.coresignal.com/cdapi/v2/employee_multi_source/collect/${id}`,
      coresignalFetchOptions({
        method: "GET",
        headers: { "Content-Type": "application/json", apikey: apiKey },
      })
    );
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(`Coresignal collect ${id}: timeout`);
    }
    throw e;
  }
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
  const cleanedName = cleanCompanyName(offer.companyName);

  console.log("[find-decision-makers] company:", offer.companyName, "→ cleaned:", cleanedName);
  console.log("[find-decision-makers] domain:", domain);
  console.log("[find-decision-makers] roles:", roles);

  // ── 1. Build ES query ──────────────────────────────────────────
  // Company matching inside a nested experience block that requires active_experience=1
  // Use match_phrase only (exact) — plain `match` tokenizes "Qevlar AI" → matches
  // every company with "AI" in the name and floods results with irrelevant profiles.
  // Domain match is kept as a precise fallback for companies indexed by website.
  const companyShould: object[] = [
    { match_phrase: { "experience.company_name": cleanedName } },
  ];

  if (domain) {
    companyShould.push({ match: { "experience.company_website.domain_only": domain } });
  }

  // Role keywords boost — lifts decision-makers to the top of results (not a hard filter)
  const allRoleKeywords = roles.flatMap((r) => _ROLE_CATEGORIES[r].keywords);
  const titleBoost = {
    bool: {
      should: allRoleKeywords.map((kw) => ({
        match: { active_experience_title: kw },
      })),
    },
  };

  const esQuery = {
    bool: {
      must: [
        { term: { is_deleted: 0 } },
        { term: { is_working: 1 } },
        {
          nested: {
            path: "experience",
            query: {
              bool: {
                must: [
                  { term: { "experience.active_experience": 1 } },
                  { bool: { should: companyShould, minimum_should_match: 1 } },
                ],
              },
            },
          },
        },
      ],
      should: [titleBoost],
    },
  };

  console.log("[find-decision-makers] esQuery:", JSON.stringify(esQuery, null, 2));

  // ── 2. Search → get IDs ────────────────────────────────────────
  let ids: number[] = [];
  try {
    ids = await coresignalSearch(profile.coresignalApiKey, esQuery);
  } catch (err) {
    console.error("[find-decision-makers] search failed:", err);
    return json({ error: String(err) }, { status: 502 });
  }

  console.log("[find-decision-makers] ids returned:", ids.length, ids.slice(0, 5));

  if (!ids.length) return json({ candidates: [] });

  // Limit to 20 collects to preserve credits
  const idsToCollect = ids.slice(0, 20);

  // ── 3. Collect each employee ──────────────────────────────────
  const employees: Array<{
    full_name?: string;
    active_experience_title?: string;
    linkedin_url?: string;
    primary_professional_email?: string;
    location_full?: string;
    picture_url?: string;
  }> = [];

  await Promise.allSettled(
    idsToCollect.map(async (id) => {
      try {
        const data = await coresignalCollect(profile.coresignalApiKey!, id);
        employees.push(data as typeof employees[0]);
      } catch (err) {
        console.warn("[find-decision-makers] collect failed for id", id, err);
      }
    })
  );

  console.log("[find-decision-makers] collected:", employees.length, "employees");

  if (!employees.length) {
    console.log("[find-decision-makers] 0 employees collected → returning empty");
    return json({ candidates: [] });
  }

  // ── 4. AI classification ──────────────────────────────────────
  const selectedCategories = roles.map((r) => ({
    key: r,
    label: _ROLE_CATEGORIES[r].label,
    keywords: _ROLE_CATEGORIES[r].keywords,
  }));

  const validEmployees = employees.filter(
    (e) => e.full_name && e.active_experience_title
  );

  console.log("[find-decision-makers] validEmployees (name+title):", validEmployees.length);
  console.log("[find-decision-makers] sample:", validEmployees.slice(0, 5).map((e) => `${e.full_name} — ${e.active_experience_title}`));

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
    const raw = completion.choices[0].message.content ?? "{}";
    console.log("[find-decision-makers] GPT response:", raw);
    const parsed = JSON.parse(raw);
    matchIndices = (parsed.matches ?? []).filter((n: unknown) => typeof n === "number");
  } catch (err) {
    console.warn("[find-decision-makers] GPT failed, falling back to keyword match:", err);
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

  console.log("[find-decision-makers] matchIndices:", matchIndices);

  // ── 5. Build response ─────────────────────────────────────────
  const candidates = matchIndices
    .map((idx) => validEmployees[idx - 1])
    .filter(Boolean)
    .map((e) => ({
      fullName: e.full_name,
      jobTitle: e.active_experience_title,
      linkedinUrl: e.linkedin_url || null,
      email: e.primary_professional_email || null,
      location: e.location_full || null,
      pictureUrl: e.picture_url || null,
    }));

  return json({ candidates });
};
