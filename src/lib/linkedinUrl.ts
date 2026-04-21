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
