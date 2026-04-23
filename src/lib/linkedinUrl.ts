/**
 * Canonicalise a LinkedIn URL so two visually-different strings that point to
 * the same profile compare equal.
 *
 * Handles:
 *  - missing protocol (`linkedin.com/in/foo` → `https://www.linkedin.com/in/foo`)
 *  - locale / mobile subdomains (`fr.linkedin.com`, `m.linkedin.com`) → `www.linkedin.com`
 *  - trailing slash / trailing query string / trailing fragment (tracking params)
 *  - trailing slugs, e.g. `/in/foo/details/contact-info` is kept as `/in/foo`
 *  - uppercase characters (LinkedIn slugs are case-insensitive)
 *  - whitespace, quotes, accidental `mailto:` / `tel:` prefixes
 *
 * Returns `null` when the input isn't a LinkedIn URL we can recognise.
 */
export function normalizeLinkedInUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = String(input).trim();
  if (!s) return null;

  // Strip surrounding quotes / zero-width chars that creep in from Excel / Notion.
  s = s.replace(/^["'`\s]+|["'`\s]+$/g, "").replace(/[\u200B-\u200D\uFEFF]/g, "");
  if (!s) return null;

  // Reject obvious non-URLs (emails, phones, "Not Found", etc.).
  if (/^mailto:/i.test(s) || /^tel:/i.test(s)) return null;
  if (/^(not\s*found|n\/a|none|-|—|null|undefined)$/i.test(s)) return null;

  // Add a protocol when missing so URL() can parse it.
  if (!/^https?:\/\//i.test(s)) {
    if (/^\/\//.test(s)) s = `https:${s}`;
    else if (/^([a-z0-9-]+\.)?linkedin\.com\//i.test(s)) s = `https://${s}`;
    else return null;
  }

  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  if (!host.endsWith("linkedin.com")) return null;

  // Drop query string + hash (mostly tracking: `?originalSubdomain`, `?trk`, `#…`).
  url.search = "";
  url.hash = "";

  // Collapse subdomains to `www.` and keep only the canonical profile path.
  let pathname = url.pathname;
  // Remove duplicate slashes and trailing slash.
  pathname = pathname.replace(/\/+/g, "/").replace(/\/+$/, "");

  // For profile URLs, keep only `/in/<slug>` (drop `/details/…`, `/overlay/…`, etc.).
  const inMatch = pathname.match(/^\/in\/([^/]+)/i);
  if (inMatch) {
    const slug = inMatch[1].toLowerCase();
    return `https://www.linkedin.com/in/${slug}`;
  }

  // Company pages: `/company/<slug>` — same treatment.
  const companyMatch = pathname.match(/^\/company\/([^/]+)/i);
  if (companyMatch) {
    return `https://www.linkedin.com/company/${companyMatch[1].toLowerCase()}`;
  }

  // School / groups / public profiles — keep path as-is, canonical host.
  const pubMatch = pathname.match(/^\/pub\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)/i);
  if (pubMatch) {
    return `https://www.linkedin.com/pub/${pubMatch[1]}/${pubMatch[2]}/${pubMatch[3]}/${pubMatch[4]}`.toLowerCase();
  }

  if (!pathname) return null;
  return `https://www.linkedin.com${pathname.toLowerCase()}`;
}

/** Small helper: `true` when the input normalises to a usable LinkedIn URL. */
export function isLinkedInUrl(input: string | null | undefined): boolean {
  return normalizeLinkedInUrl(input) !== null;
}

/**
 * Extract a human-readable display name from a LinkedIn profile URL slug.
 *
 * Example: "https://www.linkedin.com/in/cyril-sailly-08678b37"
 *       → "Cyril Sailly"
 *
 * Strategy:
 *   1. Normalise the URL and grab the `/in/<slug>` part.
 *   2. Split on hyphens.
 *   3. Drop trailing "hash" segments that LinkedIn appends for uniqueness
 *      (6+ chars made of digits/lowercase letters, often containing a digit).
 *   4. Drop anything that looks like a role keyword or generic noise.
 *   5. Title-case each remaining token.
 *
 * Returns `null` if we cannot produce at least one plausible name token.
 */
export function nameFromLinkedInSlug(input: string | null | undefined): string | null {
  const normalized = normalizeLinkedInUrl(input);
  if (!normalized) return null;
  const m = normalized.match(/\/in\/([^/]+)$/i);
  if (!m) return null;

  const slug = decodeURIComponent(m[1]);
  const parts = slug.split(/[-_]+/).filter(Boolean);
  if (!parts.length) return null;

  // Drop trailing hash segments (e.g. "08678b37", "ab12cd34", "123456")
  while (parts.length > 1) {
    const last = parts[parts.length - 1];
    const looksLikeHash = /^[0-9a-z]{6,}$/i.test(last) && /\d/.test(last);
    if (!looksLikeHash) break;
    parts.pop();
  }

  // Drop common non-name tokens that sometimes appear in slugs.
  const NOISE = new Set([
    "linkedin", "profile", "cv", "official", "pro",
    "mr", "mrs", "ms", "mme", "mr.", "mrs.", "ms.",
    "dr", "phd", "md", "esq",
  ]);
  const filtered = parts.filter((p) => !NOISE.has(p.toLowerCase()));
  if (!filtered.length) return null;

  return filtered
    .map((p) => {
      if (!p) return p;
      // Preserve intra-word capitalisation like "McDonald" if the slug was weird,
      // but default to capitalising the first letter.
      return p[0].toUpperCase() + p.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Common job-title / role keywords. When Unipile (or another enrichment source)
 * returns a "name" that is ONLY composed of words from this list, it's almost
 * certainly the job title leaking into the name field — not a real person.
 */
const ROLE_KEYWORDS = new Set([
  // English
  "account", "executive", "manager", "director", "sales", "marketing",
  "founder", "cofounder", "co", "ceo", "cto", "coo", "cfo", "cmo", "cro",
  "chief", "officer", "vp", "vice", "president", "head", "lead", "senior",
  "junior", "associate", "partner", "principal", "consultant", "analyst",
  "specialist", "engineer", "developer", "designer", "product", "owner",
  "operations", "operation", "business", "development", "bizdev", "bdr",
  "sdr", "ae", "csm", "customer", "success", "support", "growth", "people",
  "talent", "acquisition", "recruiter", "recruitment", "hr", "human",
  "resources", "finance", "financial", "legal", "revenue", "strategy",
  "strategic", "solution", "solutions", "enterprise", "corporate",
  "international", "global", "regional", "country", "emea", "apac", "na",
  "team", "group", "division", "department", "portfolio", "program",
  "project", "deputy", "assistant", "intern", "trainee", "freelance",
  "freelancer", "contractor", "student", "member",
  // French
  "directeur", "directrice", "responsable", "chargé", "chargée", "chef",
  "président", "présidente", "dirigeant", "dirigeante", "gérant", "gérante",
  "commercial", "commerciale", "développement", "développeur", "ingénieur",
  "ingénieure", "consultant", "consultante", "analyste", "général",
  "générale", "adjoint", "adjointe", "stagiaire", "fondateur", "fondatrice",
]);

/**
 * Returns `true` when `candidate` looks like it's NOT a real person name but
 * rather a job title or the literal "LinkedIn Member" fallback that LinkedIn
 * returns for out-of-network profiles.
 */
export function looksLikeJobTitleNotName(
  candidate: string | null | undefined,
  headline?: string | null,
): boolean {
  if (!candidate) return true;
  const trimmed = candidate.trim();
  if (!trimmed) return true;

  // Known LinkedIn placeholders.
  if (/^linkedin\s*(member|user)$/i.test(trimmed)) return true;
  if (/^unknown$/i.test(trimmed)) return true;

  // If the "name" equals the headline, it's almost certainly a job title.
  if (headline && trimmed.toLowerCase() === headline.trim().toLowerCase()) return true;

  const tokens = trimmed
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-zà-öø-ÿ']/gi, ""))
    .filter(Boolean);

  if (!tokens.length) return true;

  // All tokens are role keywords → not a person name.
  const allRoles = tokens.every((t) => ROLE_KEYWORDS.has(t));
  if (allRoles) return true;

  return false;
}
