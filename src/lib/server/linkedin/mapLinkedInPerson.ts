import type { UnipileLinkedInPerson } from "$lib/services/UnipileService";
import { normalizeLinkedInUrl, nameFromLinkedInSlug, looksLikeJobTitleNotName } from "$lib/linkedinUrl";
import type { LinkedInEmployeeCandidate } from "./types";

export function mapLinkedInPersonToCandidate(
  item: UnipileLinkedInPerson,
): LinkedInEmployeeCandidate | null {
  const rawUrl = item.public_profile_url ?? item.profile_url ?? null;
  const linkedinUrl = normalizeLinkedInUrl(rawUrl);
  if (!linkedinUrl) return null;

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
  if (!fullName) return null;

  return {
    fullName,
    jobTitle,
    linkedinUrl,
    email: null,
    location: (item.location ?? null) || null,
    pictureUrl: item.profile_picture_url ?? null,
  };
}
