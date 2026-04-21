/**
 * Pure utilities for comparing offers / company names.  Safe to import on the
 * client (no DB / server-only deps).  The server-side counterpart in
 * `$lib/server/offerMatch.ts` re-exports these + exposes DB-backed helpers.
 */

export type MinimalOffer = {
  companyName: string | null | undefined;
  offerTitle: string | null | undefined;
  offerUrl: string | null | undefined;
};

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

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
  s = s.split(/[|•·–—:]/)[0] ?? s;
  s = s.replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  if (!s) return "";
  const tokens = s.split(" ").filter(Boolean);
  while (tokens.length > 1 && COMPANY_SUFFIXES.includes(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  return tokens.join("");
}

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

export function findDuplicateOffers<
  T extends MinimalOffer & { id: string },
  P extends MinimalOffer & { id: string },
>(target: T, pool: P[]): P[] {
  return pool.filter(
    (o) =>
      o.id !== target.id && companyMatches(o.companyName, target.companyName),
  );
}

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
    hasMatch(input: MinimalOffer): boolean {
      const url = normalizeUrl(input.offerUrl);
      if (url && urlSet.has(url)) return true;
      return pool.some((o) => isSameOffer(o, input));
    },
  };
}
