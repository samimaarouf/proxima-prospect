/**
 * Décisionnaires-finder backed by Unipile's LinkedIn Classic search.
 *
 * Why Unipile instead of an LLM web search:
 *   - We re-use the user's already-connected LinkedIn account, so results come
 *     straight from LinkedIn's own index — no hallucinated URLs, real photos,
 *     fresh job titles.
 *   - Zero token cost and much faster than spinning up Claude/OpenAI with a
 *     web-search tool.
 *
 * Flow:
 *   1. Resolve the offer's company name to a LinkedIn company ID.
 *   2. (Best-effort) resolve the offer location to a LinkedIn location ID.
 *   3. Build a boolean `keywords` string from the selected role categories.
 *   4. POST /linkedin/search (Classic, category=people) scoped by those IDs.
 *   5. Map results to the existing Candidate shape the UI already consumes.
 *
 * Output contract (unchanged): same candidate shape as /find-decision-makers
 * so the existing UI selection + add-contact flow works as-is.
 */
import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { prospectOffer, user } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import { getUnipileService, type UnipileLinkedInPerson } from "$lib/services/UnipileService";
import { _ROLE_CATEGORIES, type RoleCategoryKey } from "../find-decision-makers/+server";
import { normalizeLinkedInUrl, nameFromLinkedInSlug, looksLikeJobTitleNotName } from "$lib/linkedinUrl";
import { chatComplete, activeChatProvider } from "$lib/server/aiChat";
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

/**
 * Build a LinkedIn-friendly boolean `keywords` string for a single role.
 * Matches the shape used when the single-role search worked before:
 *   (Founder OR "Co-Founder" OR CEO OR "Co-Founder & CEO" OR "Président" OR Dirigeant)
 * Cap at top-6 synonyms so each role fits well under LinkedIn's length
 * budget (a single role's block always stayed < ~130 chars in practice).
 */
function buildKeywordsForRole(role: RoleCategoryKey): string {
  const cat = _ROLE_CATEGORIES[role];
  if (!cat) return "";
  const top = [...cat.keywords]
    .slice(0, 6)
    .map((k) => (k.includes(" ") ? `"${k}"` : k));
  if (top.length === 0) return "";
  return `(${top.join(" OR ")})`;
}

export const POST: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) return json({ error: "Non authentifié" }, { status: 401 });

  const [userRow] = await db
    .select({ unipileLinkedInAccountId: user.unipileLinkedInAccountId })
    .from(user)
    .where(eq(user.id, locals.user.id))
    .limit(1);

  const accountId = userRow?.unipileLinkedInAccountId;
  if (!accountId) {
    return json(
      { error: "Connectez votre compte LinkedIn dans les paramètres pour utiliser la recherche LinkedIn." },
      { status: 400 },
    );
  }

  const [offer] = await db.select().from(prospectOffer).where(eq(prospectOffer.id, params.id)).limit(1);
  if (!offer) return json({ error: "Offre introuvable" }, { status: 404 });

  const { roles } = (await request.json()) as { roles: RoleCategoryKey[] };
  if (!roles?.length) return json({ error: "Aucun rôle sélectionné" }, { status: 400 });

  const company = cleanCompanyName(offer.companyName);
  const location = offer.offerLocation?.trim() || null;

  const unipile = getUnipileService();

  // 1. Resolve company → LinkedIn internal ID. Strict: if nothing matches we
  //    refuse rather than polluting results with keyword-only matches.
  const companyId = await unipile.getSearchParameterId(accountId, "COMPANY", company);
  if (!companyId) {
    return json(
      {
        error: `L'entreprise "${company}" n'a pas de page LinkedIn indexée. Essayez Coresignal ou ajoutez un contact manuellement.`,
      },
      { status: 404 },
    );
  }

  // 2. Resolve a country-level location ID. Default to "France"; if that
  //    fails, try the country extracted from offerLocation (last segment
  //    after the last comma). Staying at country level avoids the "Puteaux
  //    vs Paris vs Île-de-France" mismatch that returns 0 hits on city IDs.
  const extractCountry = (loc: string): string => {
    const segments = loc.split(",").map((s) => s.trim()).filter(Boolean);
    return segments.length >= 2 ? segments[segments.length - 1] : loc;
  };

  let locationId: string | null = await unipile.getSearchParameterId(accountId, "LOCATION", "France");
  if (locationId) {
    console.log(`[find-decision-makers-web] location resolved: "France" → id=${locationId}`);
  } else if (location) {
    const country = extractCountry(location);
    if (country !== "France") {
      locationId = await unipile.getSearchParameterId(accountId, "LOCATION", country);
      if (locationId) {
        console.log(`[find-decision-makers-web] location resolved: "${country}" → id=${locationId}`);
      } else {
        console.log(`[find-decision-makers-web] location "${country}" not resolved, will search without`);
      }
    }
  }

  // One Unipile search per selected role, in parallel. Each call uses the
  // role's top-6 synonyms as a boolean OR so LinkedIn ranks matching
  // leadership titles first. Splitting roles into separate calls keeps the
  // per-call `keywords` payload well under LinkedIn's length budget.
  const runSearches = async (withLocation: boolean) =>
    Promise.all(
      roles.map(async (role) => {
        const keywords = buildKeywordsForRole(role);
        if (!keywords) return [] as UnipileLinkedInPerson[];
        const response = await unipile.searchLinkedInPeople(accountId, {
          keywords,
          company: [companyId],
          location: withLocation && locationId ? [locationId] : undefined,
          limit: 50,
        });
        return response.items ?? [];
      }),
    );

  let results: UnipileLinkedInPerson[] = [];
  try {
    if (locationId) {
      console.log(
        `[find-decision-makers-web] → company="${company}" (id=${companyId}) location=${locationId} × ${roles.length} role(s)`,
      );
      const withLoc = (await runSearches(true)).flat();
      if (withLoc.length > 0) {
        results = withLoc;
      } else {
        // Location filter was too narrow (e.g. "Puteaux" while employees
        // listed "Paris" or "Île-de-France"). Retry without location.
        console.log(
          `[find-decision-makers-web] 0 hits with location=${locationId}, retrying without location filter`,
        );
        results = (await runSearches(false)).flat();
      }
    } else {
      results = (await runSearches(false)).flat();
    }
  } catch (err) {
    console.error("[find-decision-makers-web] unipile search failed:", err);
    return json(
      { error: err instanceof Error ? err.message : "La recherche LinkedIn a échoué" },
      { status: 502 },
    );
  }

  console.log(
    `[find-decision-makers-web] company="${company}" × ${roles.length} role(s) → ${results.length} raw hit(s) (pre-dedup)`,
  );

  const seen = new Set<string>();
  const candidates: WebCandidate[] = [];

  for (const item of results) {
    const rawUrl = item.public_profile_url ?? item.profile_url ?? null;
    const linkedinUrl = normalizeLinkedInUrl(rawUrl);
    if (!linkedinUrl) continue;
    if (seen.has(linkedinUrl)) continue;
    seen.add(linkedinUrl);

    let fullName = (item.name ?? "").toString().trim();
    if (!fullName) {
      const fn = (item.first_name ?? "").toString().trim();
      const ln = (item.last_name ?? "").toString().trim();
      fullName = [fn, ln].filter(Boolean).join(" ").trim();
    }

    const currentRole = item.current_positions?.[0]?.role ?? null;
    const jobTitle = (currentRole ?? item.headline ?? "").toString().trim();

    if (!fullName || looksLikeJobTitleNotName(fullName, jobTitle)) {
      const slugName = nameFromLinkedInSlug(linkedinUrl);
      if (slugName) fullName = slugName;
    }
    if (!fullName) continue;

    candidates.push({
      fullName,
      jobTitle,
      linkedinUrl,
      email: null,
      location: (item.location ?? null) || null,
      pictureUrl: item.profile_picture_url ?? null,
    });

    if (candidates.length >= 25) break;
  }

  console.log(
    `[find-decision-makers-web] ${candidates.length} candidate(s) for "${company}"${location ? ` @ ${location}` : ""}`,
  );

  // Re-rank via Claude by hierarchy + relevance. Safe-fallback: if the LLM
  // call fails or returns something unparseable, we keep the original
  // LinkedIn-ranked order.
  const ranked = await rankCandidatesWithAI(candidates, roles, company).catch((err) => {
    console.warn("[find-decision-makers-web] AI re-rank failed, keeping LinkedIn order:", err);
    return candidates;
  });

  return json({ candidates: ranked });
};

/**
 * Ask Claude (via the shared chatComplete helper) to re-order candidates
 * putting the most senior + most role-relevant profiles first. Returns the
 * same array, reshuffled. Unranked items are appended at the end in their
 * original order. No-ops if fewer than 2 candidates or no AI key is set.
 */
async function rankCandidatesWithAI(
  candidates: WebCandidate[],
  roles: RoleCategoryKey[],
  company: string,
): Promise<WebCandidate[]> {
  if (candidates.length < 2) return candidates;
  if (activeChatProvider() === "none") return candidates;

  const roleLabels = roles
    .map((r) => _ROLE_CATEGORIES[r]?.label)
    .filter(Boolean)
    .join(", ");

  const indexed = candidates.map((c, i) => ({
    idx: i,
    name: c.fullName,
    title: c.jobTitle || "(titre inconnu)",
    location: c.location || "",
  }));

  const systemPrompt = `Tu es un expert en prospection B2B. On te donne une liste de salariés d'une entreprise qui matchent des rôles cibles. Ta mission : les classer par ordre de priorité pour une prise de contact commerciale, du plus décisionnaire au moins décisionnaire.

Critères de classement :
1. Séniorité / hiérarchie (CEO > VP > Directeur > Head of > Manager > Lead > Senior > junior).
2. Pertinence du titre vis-à-vis des rôles cibles (un titre qui matche exactement > un titre adjacent).
3. En cas d'égalité, préférer les profils au titre le plus court et explicite (signe de séniorité élevée).

Réponds EXCLUSIVEMENT avec un objet JSON du format {"order":[idx1, idx2, ...]} listant TOUS les index d'entrée dans le nouvel ordre, sans markdown ni commentaire.`;

  const userPrompt = `Entreprise : ${company}
Rôles ciblés : ${roleLabels}

Profils à classer (index, nom, titre, lieu) :
${indexed.map((c) => `${c.idx}. ${c.name} — ${c.title}${c.location ? ` (${c.location})` : ""}`).join("\n")}`;

  const raw = await chatComplete({
    systemPrompt,
    userPrompt,
    maxTokens: 500,
    temperature: 0.1,
  });

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) return candidates;

  let parsed: { order?: unknown };
  try {
    parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1));
  } catch {
    return candidates;
  }

  const order = Array.isArray(parsed.order) ? parsed.order : null;
  if (!order) return candidates;

  const used = new Set<number>();
  const reordered: WebCandidate[] = [];
  for (const idxRaw of order) {
    const idx = typeof idxRaw === "number" ? idxRaw : Number(idxRaw);
    if (!Number.isInteger(idx) || idx < 0 || idx >= candidates.length) continue;
    if (used.has(idx)) continue;
    used.add(idx);
    reordered.push(candidates[idx]);
  }
  // Append anything the LLM forgot, preserving original order.
  for (let i = 0; i < candidates.length; i++) {
    if (!used.has(i)) reordered.push(candidates[i]);
  }

  console.log(
    `[find-decision-makers-web] AI re-ranked ${reordered.length} candidate(s) via ${activeChatProvider()}`,
  );
  return reordered;
}
