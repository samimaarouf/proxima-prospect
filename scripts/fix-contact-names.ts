/**
 * Repairs contacts whose `full_name` column is actually a job title leaked
 * from the offer title (e.g. "Account Executive", "Sales Manager") or a
 * LinkedIn placeholder ("LinkedIn Member", empty string, etc.).
 *
 * When a replacement name can be derived from the LinkedIn URL slug
 * (e.g. /in/cyril-sailly-08678b37 → "Cyril Sailly"), the contact is updated.
 * Otherwise it's reported but left untouched so you can decide manually.
 *
 * Usage:
 *   npx tsx scripts/fix-contact-names.ts                  # dry-run, slug only
 *   npx tsx scripts/fix-contact-names.ts --commit         # write, slug only
 *   npx tsx scripts/fix-contact-names.ts --ai             # dry-run, slug + web search
 *   npx tsx scripts/fix-contact-names.ts --ai --commit    # write, slug + web search
 *   npx tsx scripts/fix-contact-names.ts <listId>         # scope to one list
 *   npx tsx scripts/fix-contact-names.ts <listId> --ai --commit
 *
 * Flags:
 *   --commit    actually write (default: dry-run)
 *   --ai        when the slug is weak (1 token / generic), also query OpenAI
 *               web search with the offer context. Costs a few cents per
 *               contact — off by default.
 */
import { Pool } from "pg";
import { config } from "dotenv";
import OpenAI from "openai";
import { nameFromLinkedInSlug, looksLikeJobTitleNotName } from "../src/lib/linkedinUrl";

config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL manquante");

const args = process.argv.slice(2);
const commit = args.includes("--commit");
const useAi = args.includes("--ai");
const listId = args.find((a) => !a.startsWith("--")) ?? null;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (useAi && !OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY manquante dans .env (requis avec --ai)");
}
const openai = useAi ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

async function resolveViaWebSearch(
  linkedinUrl: string,
  companyName: string | null,
  jobTitle: string | null,
  hint: string | null,
): Promise<string | null> {
  if (!openai) return null;
  const contextLines = [
    `URL LinkedIn : ${linkedinUrl}`,
    companyName ? `Entreprise : ${companyName}` : null,
    jobTitle ? `Poste affiché : ${jobTitle}` : null,
    hint ? `Indice (approximatif) : ${hint}` : null,
  ].filter(Boolean).join("\n");
  const prompt = `Trouve le VRAI nom (prénom + nom) de la personne derrière cette URL LinkedIn. Utilise une recherche web.

${contextLines}

Réponds STRICTEMENT en JSON, sans markdown :
{"firstName": "...", "lastName": "...", "confidence": "high" | "medium" | "low"}

Si tu n'es pas sûr à >= 70 %, renvoie {"firstName": null, "lastName": null, "confidence": "low"}.`;

  try {
    const res = await (openai as unknown as {
      responses: {
        create: (a: {
          model: string;
          tools: { type: string }[];
          messages: { role: string; content: string }[];
        }) => Promise<{ output_text?: string }>;
      };
    }).responses.create({
      model: "gpt-4o-mini-search-preview",
      tools: [{ type: "web_search_preview" }],
      messages: [{ role: "user", content: prompt }],
    });
    const raw = (res.output_text ?? "").trim()
      .replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      firstName?: string | null;
      lastName?: string | null;
      confidence?: "high" | "medium" | "low";
    };
    if (parsed.confidence === "low") return null;
    const firstName = (parsed.firstName ?? "").trim();
    const lastName = (parsed.lastName ?? "").trim();
    if (!firstName && !lastName) return null;
    return [firstName, lastName].filter(Boolean).join(" ");
  } catch {
    return null;
  }
}

const pool = new Pool({ connectionString: DATABASE_URL });

const baseQuery = `
  SELECT pc.id,
         pc.full_name,
         pc.job_title,
         pc.linkedin_url,
         po.offer_title,
         po.company_name,
         po.list_id
  FROM prospect_contact pc
  JOIN prospect_offer po ON po.id = pc.offer_id
  ${listId ? "WHERE po.list_id = $1" : ""}
  ORDER BY po.list_id, po.offer_title, pc.full_name
`;

const { rows: contacts } = await pool.query(baseQuery, listId ? [listId] : []);

console.log(`${contacts.length} contact(s) inspected${listId ? ` (list ${listId})` : ""}`);
console.log(commit ? "⚠️  COMMIT mode — changes will be written" : "🧪 dry-run (pass --commit to write)");
console.log("");

let fixable = 0;
let unfixable = 0;
let skipped = 0;

for (const c of contacts) {
  // Consider a name polluted if:
  //   1. It looks like a job title / placeholder (generic check)
  //   2. OR it equals the offer title (exact match, case insensitive)
  const equalsOfferTitle =
    !!c.full_name &&
    !!c.offer_title &&
    c.full_name.trim().toLowerCase() === c.offer_title.trim().toLowerCase();

  const polluted =
    looksLikeJobTitleNotName(c.full_name, c.job_title) || equalsOfferTitle;

  if (!polluted) {
    skipped++;
    continue;
  }

  const slugName = nameFromLinkedInSlug(c.linkedin_url);

  // Decide which source to use. Slug first, then web search if slug is weak.
  const slugIsWeak =
    !slugName ||
    slugName.trim().split(/\s+/).length < 2 ||
    looksLikeJobTitleNotName(slugName, c.job_title);

  let replacement: string | null = slugIsWeak ? null : slugName;
  let source = slugIsWeak ? "" : "slug";

  if (useAi && slugIsWeak && c.linkedin_url) {
    const aiName = await resolveViaWebSearch(
      c.linkedin_url,
      c.company_name ?? null,
      c.job_title ?? null,
      slugName,
    );
    if (aiName) {
      replacement = aiName;
      source = "ai";
    }
  }

  if (!replacement) {
    unfixable++;
    console.log(
      `❓ ${c.id}  "${c.full_name ?? ""}"  — no recovery source  ` +
        `(slug: ${c.linkedin_url ?? "none"}, offer: "${c.offer_title ?? ""}")`,
    );
    continue;
  }

  fixable++;
  console.log(
    `✅ ${c.id}  "${c.full_name ?? ""}" → "${replacement}"  [${source}]  ` +
      `(job: "${c.job_title ?? ""}", company: "${c.company_name ?? ""}")`,
  );

  if (commit) {
    await pool.query(
      `UPDATE prospect_contact SET full_name = $1, updated_at = NOW() WHERE id = $2`,
      [replacement, c.id],
    );
  }
}

console.log("");
console.log(`Summary : ${fixable} fixable, ${unfixable} unfixable, ${skipped} clean`);
if (!commit && fixable > 0) {
  console.log("Re-run with --commit to apply the changes above.");
}

await pool.end();
