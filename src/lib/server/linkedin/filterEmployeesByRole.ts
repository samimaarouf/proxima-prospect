import { chatCompleteJson, activeChatProvider } from "$lib/server/aiChat";
import { ROLE_CATEGORIES, type RoleCategoryKey } from "$lib/server/linkedin/roleCategories";
import { buildRoleQuery } from "./buildRoleQuery";
import type { LinkedInEmployeeCandidate } from "./types";

const BATCH_SIZE = 120;
const MAX_RESULTS = 25;

function keywordFallback(
  employees: LinkedInEmployeeCandidate[],
  roles: RoleCategoryKey[],
): LinkedInEmployeeCandidate[] {
  const keywords = roles.flatMap((r) => ROLE_CATEGORIES[r].keywords).map((k) => k.toLowerCase());
  return employees
    .filter((e) => {
      const title = e.jobTitle.toLowerCase();
      return keywords.some((kw) => title.includes(kw));
    })
    .slice(0, MAX_RESULTS);
}

async function filterBatch(
  batch: LinkedInEmployeeCandidate[],
  batchOffset: number,
  roleQuery: string,
  companyName: string,
): Promise<number[]> {
  const indexed = batch.map((e, i) => ({
    idx: i,
    name: e.fullName,
    title: e.jobTitle || "(titre inconnu)",
  }));

  const systemPrompt = `Tu es un expert en prospection B2B. On te donne la liste des employés d'une entreprise avec leur titre LinkedIn.

Ta mission : identifier ceux qui correspondent aux critères de rôle demandés.

Règles strictes :
- Base-toi UNIQUEMENT sur le titre affiché. N'invente rien.
- Interprète le sens du titre (ex. "Account Executive" = commercial, "Business Analyst" ≠ commercial).
- En cas de doute → exclure.
- Trie par pertinence pour une prise de contact : du plus décisionnaire au moins décisionnaire (CEO > VP > Directeur > Head of > Manager > Lead > Senior).

Réponds EXCLUSIVEMENT avec un objet JSON : {"matches":[idx1, idx2, ...]}
Les idx sont 0-based dans la liste fournie, dans l'ordre de priorité. Sans markdown ni commentaire.`;

  const userPrompt = `Entreprise : ${companyName}
Critères de rôle : ${roleQuery}

Employés (idx, nom, titre) :
${indexed.map((e) => `${e.idx}. ${e.name} — ${e.title}`).join("\n")}`;

  const parsed = await chatCompleteJson<{ matches?: unknown }>({
    systemPrompt,
    userPrompt,
    maxTokens: 800,
    temperature: 0.1,
  });

  const matches = Array.isArray(parsed.matches) ? parsed.matches : [];
  const globalIndices: number[] = [];

  for (const raw of matches) {
    const localIdx = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isInteger(localIdx) || localIdx < 0 || localIdx >= batch.length) continue;
    globalIndices.push(batchOffset + localIdx);
  }

  return globalIndices;
}

export async function filterEmployeesByRole(
  employees: LinkedInEmployeeCandidate[],
  roles: RoleCategoryKey[],
  companyName: string,
): Promise<LinkedInEmployeeCandidate[]> {
  if (!employees.length) return [];

  if (activeChatProvider() === "none") {
    console.warn("[filterEmployeesByRole] no AI provider, using keyword fallback");
    return keywordFallback(employees, roles);
  }

  const roleQuery = buildRoleQuery(roles);
  const seen = new Set<number>();
  const matched: LinkedInEmployeeCandidate[] = [];

  for (let offset = 0; offset < employees.length; offset += BATCH_SIZE) {
    const batch = employees.slice(offset, offset + BATCH_SIZE);
    try {
      const indices = await filterBatch(batch, offset, roleQuery, companyName);
      for (const idx of indices) {
        if (seen.has(idx)) continue;
        seen.add(idx);
        matched.push(employees[idx]);
        if (matched.length >= MAX_RESULTS) break;
      }
    } catch (err) {
      console.warn("[filterEmployeesByRole] AI batch failed, skipping batch:", err);
    }
    if (matched.length >= MAX_RESULTS) break;
  }

  if (matched.length === 0) {
    console.warn("[filterEmployeesByRole] AI returned 0 matches, using keyword fallback");
    return keywordFallback(employees, roles);
  }

  console.log(
    `[filterEmployeesByRole] ${matched.length} match(es) from ${employees.length} employee(s) for "${companyName}"`,
  );
  return matched;
}
