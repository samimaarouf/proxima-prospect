/**
 * Décisionnaires-finder backed by Unipile's LinkedIn Classic search.
 *
 * Flow:
 *   1. Resolve the offer's company name to a LinkedIn company ID.
 *   2. (Best-effort) resolve the offer location to a LinkedIn location ID.
 *   3. Fetch ALL employees at the company (no role keywords — wide net).
 *   4. Claude filters semantically by job title against the selected roles.
 *   5. Return up to 25 candidates in priority order.
 */
import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { prospectOffer, user } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import { getUnipileService } from "$lib/services/UnipileService";
import type { RoleCategoryKey } from "$lib/server/linkedin/roleCategories";
import { fetchCompanyEmployees } from "$lib/server/linkedin/fetchCompanyEmployees";
import { filterEmployeesByRole } from "$lib/server/linkedin/filterEmployeesByRole";
import { mapLinkedInPersonToCandidate } from "$lib/server/linkedin/mapLinkedInPerson";
import type { RequestHandler } from "./$types";

export { ROLE_CATEGORIES as _ROLE_CATEGORIES, type RoleCategoryKey } from "$lib/server/linkedin/roleCategories";

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

  const companyId = await unipile.getSearchParameterId(accountId, "COMPANY", company);
  if (!companyId) {
    return json(
      {
        error: `L'entreprise "${company}" n'a pas de page LinkedIn indexée. Ajoutez un contact manuellement.`,
      },
      { status: 404 },
    );
  }

  const extractCountry = (loc: string): string => {
    const segments = loc.split(",").map((s) => s.trim()).filter(Boolean);
    return segments.length >= 2 ? segments[segments.length - 1] : loc;
  };

  let locationId: string | null = await unipile.getSearchParameterId(accountId, "LOCATION", "France");
  if (locationId) {
    console.log(`[find-decision-makers] location resolved: "France" → id=${locationId}`);
  } else if (location) {
    const country = extractCountry(location);
    if (country !== "France") {
      locationId = await unipile.getSearchParameterId(accountId, "LOCATION", country);
      if (locationId) {
        console.log(`[find-decision-makers] location resolved: "${country}" → id=${locationId}`);
      } else {
        console.log(`[find-decision-makers] location "${country}" not resolved, will search without`);
      }
    }
  }

  let rawEmployees;
  try {
    console.log(
      `[find-decision-makers] fetching all employees → company="${company}" (id=${companyId})`,
    );
    rawEmployees = await fetchCompanyEmployees({
      accountId,
      companyId,
      locationId,
    });
  } catch (err) {
    console.error("[find-decision-makers] employee fetch failed:", err);
    return json(
      { error: err instanceof Error ? err.message : "La recherche LinkedIn a échoué" },
      { status: 502 },
    );
  }

  console.log(
    `[find-decision-makers] company="${company}" → ${rawEmployees.length} raw employee(s) (pre-dedup)`,
  );

  const seen = new Set<string>();
  const employees = [];

  for (const item of rawEmployees) {
    const candidate = mapLinkedInPersonToCandidate(item);
    if (!candidate) continue;
    if (seen.has(candidate.linkedinUrl)) continue;
    seen.add(candidate.linkedinUrl);
    employees.push(candidate);
  }

  console.log(`[find-decision-makers] ${employees.length} unique employee(s) after dedup`);

  const candidates = await filterEmployeesByRole(employees, roles, company).catch((err) => {
    console.warn("[find-decision-makers] AI filter failed:", err);
    return [];
  });

  console.log(
    `[find-decision-makers] ${candidates.length} candidate(s) for "${company}"${location ? ` @ ${location}` : ""}`,
  );

  return json({ candidates });
};
