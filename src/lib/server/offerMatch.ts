import { db } from "$lib/server/db";
import { prospectList, prospectOffer } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";

export type MinimalOffer = {
  companyName: string | null | undefined;
  offerTitle: string | null | undefined;
  offerUrl: string | null | undefined;
};

/**
 * Lowercase + Unicode NFD + strip combining marks so that é/É/e all match.
 */
function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Normalize a company name so variants collapse together:
 *   "Médiaperformances"  → "mediaperformances"
 *   "MÉDIA PERFORMANCES" → "mediaperformances"
 *   "Mediaperformances SAS." → "mediaperformances"
 */
const COMPANY_SUFFIXES = [
  "sas",
  "sasu",
  "sarl",
  "sa",
  "eurl",
  "sci",
  "snc",
  "llc",
  "ltd",
  "inc",
  "corp",
  "corporation",
  "gmbh",
  "bv",
  "ag",
  "plc",
  "group",
  "groupe",
  "holding",
];

export function normalizeCompany(name: string | null | undefined): string {
  if (!name) return "";
  let s = stripDiacritics(String(name)).toLowerCase();
  // If the name contains a tagline separator (|, – / — / tiret, :, etc.)
  // keep only the part before it: "Pixalione | SEO, Paid, IA" → "Pixalione".
  s = s.split(/[|•·–—:]/)[0] ?? s;
  // Replace punctuation and separators by spaces, then collapse.
  s = s.replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  if (!s) return "";
  const tokens = s.split(" ").filter(Boolean);
  // Strip trailing legal-form tokens (repeatedly, in case of "sas group").
  while (tokens.length > 1 && COMPANY_SUFFIXES.includes(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  // Collapse everything for the final key (so "media performances" ==
  // "mediaperformances"). This is aggressive but exactly what we want for
  // same-company detection across sloppily-typed imports.
  return tokens.join("");
}

/**
 * Returns true when two company names refer to the same company, even in the
 * presence of taglines or extra descriptors.
 *
 *   "Pixalione" ≡ "PIXALIONE | SEO, Paid, IA, Data & CRO"
 *   "Médiaperformances" ≡ "Mediaperformances SAS"
 *
 * We consider a prefix match only when the shorter key is at least 5 chars,
 * to avoid false positives like "Air France" ≡ "Air Liquide".
 */
export function companyMatches(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const ka = normalizeCompany(a);
  const kb = normalizeCompany(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const [shorter, longer] = ka.length <= kb.length ? [ka, kb] : [kb, ka];
  return shorter.length >= 5 && longer.startsWith(shorter);
}

export function normalizeTitle(title: string | null | undefined): string {
  if (!title) return "";
  const s = stripDiacritics(String(title)).toLowerCase();
  return s.replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function normalizeUrl(url: string | null | undefined): string {
  const raw = (url || "").trim().toLowerCase();
  if (!raw) return "";
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    u.hash = "";
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "");
    return `${host}${path}`;
  } catch {
    return raw.replace(/[#?].*$/, "").replace(/\/+$/, "");
  }
}

/**
 * Checks whether two offers refer to the same thing.
 * - If both have an offerUrl, match on normalized URL.
 * - Otherwise, match when company AND offer title are the same (both non-empty).
 */
export function isSameOffer(a: MinimalOffer, b: MinimalOffer): boolean {
  const urlA = normalizeUrl(a.offerUrl);
  const urlB = normalizeUrl(b.offerUrl);
  if (urlA && urlB) return urlA === urlB;
  const titleA = normalizeTitle(a.offerTitle);
  const titleB = normalizeTitle(b.offerTitle);
  if (!titleA || !titleB) return false;
  if (titleA !== titleB) return false;
  return companyMatches(a.companyName, b.companyName);
}

/**
 * Loads every offer belonging to a user across all their lists.
 * Returns the fields needed for matching + list info.
 */
export async function loadUserOffers(userId: string) {
  return db
    .select({
      id: prospectOffer.id,
      listId: prospectOffer.listId,
      listName: prospectList.name,
      companyName: prospectOffer.companyName,
      offerTitle: prospectOffer.offerTitle,
      offerUrl: prospectOffer.offerUrl,
    })
    .from(prospectOffer)
    .innerJoin(prospectList, eq(prospectList.id, prospectOffer.listId))
    .where(eq(prospectList.userId, userId));
}

export type UserOffer = Awaited<ReturnType<typeof loadUserOffers>>[number];

/**
 * Among `pool`, returns the offers that refer to the SAME company as `target`
 * (excluding the target itself).  Used to flag yellow rows and populate the
 * "duplicates" block in the offer sheet.  We include offers that are the
 * exact same (same URL or same title) because the user wants to be warned
 * about any cross-list presence of the company — same-offer duplicates are
 * often a sign the list was re-imported or recovered.
 */
export function findDuplicateOffers<
  T extends MinimalOffer & { id: string },
  P extends MinimalOffer & { id: string },
>(target: T, pool: P[]): P[] {
  return pool.filter(
    (o) =>
      o.id !== target.id && companyMatches(o.companyName, target.companyName),
  );
}

/**
 * Build a fast lookup index for existing offers.
 * URL matches are indexed (O(1)); company+title matches fall back to a linear
 * scan because company matching is fuzzy (prefix).
 */
export function buildOfferIndex(offers: Iterable<MinimalOffer> = []) {
  const urlSet = new Set<string>();
  const pool: MinimalOffer[] = [];

  function add(o: MinimalOffer) {
    const url = normalizeUrl(o.offerUrl);
    if (url) urlSet.add(url);
    pool.push(o);
  }

  for (const o of offers) add(o);

  return {
    add,
    /** Returns true if any offer in the index matches the input. */
    hasMatch(input: MinimalOffer): boolean {
      const url = normalizeUrl(input.offerUrl);
      if (url && urlSet.has(url)) return true;
      return pool.some((o) => isSameOffer(o, input));
    },
  };
}
