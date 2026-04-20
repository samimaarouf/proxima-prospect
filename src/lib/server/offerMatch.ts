import { db } from "$lib/server/db";
import { prospectList, prospectOffer } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";

export type MinimalOffer = {
  companyName: string | null | undefined;
  offerTitle: string | null | undefined;
  offerUrl: string | null | undefined;
};

export function normalizeCompany(name: string | null | undefined): string {
  return (name || "").trim().toLowerCase();
}

export function normalizeTitle(title: string | null | undefined): string {
  return (title || "").trim().toLowerCase().replace(/\s+/g, " ");
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
  const companyA = normalizeCompany(a.companyName);
  const companyB = normalizeCompany(b.companyName);
  const titleA = normalizeTitle(a.offerTitle);
  const titleB = normalizeTitle(b.offerTitle);
  if (!companyA || !companyB || !titleA || !titleB) return false;
  return companyA === companyB && titleA === titleB;
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
      companyName: prospectOffer.companyName,
      offerTitle: prospectOffer.offerTitle,
      offerUrl: prospectOffer.offerUrl,
    })
    .from(prospectOffer)
    .innerJoin(prospectList, eq(prospectList.id, prospectOffer.listId))
    .where(eq(prospectList.userId, userId));
}

/**
 * Build a fast lookup index for existing offers.
 * Returns a checker that answers "does this offer already exist?" plus an
 * `add` helper so the index can grow as new rows are imported.
 */
export function buildOfferIndex(offers: Iterable<MinimalOffer> = []) {
  const urlSet = new Set<string>();
  const companyTitleSet = new Set<string>();

  function add(o: MinimalOffer) {
    const url = normalizeUrl(o.offerUrl);
    if (url) urlSet.add(url);
    const c = normalizeCompany(o.companyName);
    const t = normalizeTitle(o.offerTitle);
    if (c && t) companyTitleSet.add(`${c}||${t}`);
  }

  for (const o of offers) add(o);

  return {
    add,
    /** Returns true if any offer in the index matches the input. */
    hasMatch(input: MinimalOffer): boolean {
      const url = normalizeUrl(input.offerUrl);
      if (url && urlSet.has(url)) return true;
      const c = normalizeCompany(input.companyName);
      const t = normalizeTitle(input.offerTitle);
      if (c && t && companyTitleSet.has(`${c}||${t}`)) return true;
      return false;
    },
  };
}
