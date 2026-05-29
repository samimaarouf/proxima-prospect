import { UnipileService } from "$lib/services/UnipileService";
import type { PersonalizationSignal } from "./types";

const MAX_POST_AGE_DAYS = 90;

function daysSince(isoDate: string | undefined): number | undefined {
  if (!isoDate) return undefined;
  const parsed = Date.parse(isoDate);
  if (Number.isNaN(parsed)) return undefined;
  return Math.floor((Date.now() - parsed) / (1000 * 60 * 60 * 24));
}

export async function fetchLatestContactPost(params: {
  accountId: string;
  providerId: string;
}): Promise<PersonalizationSignal | null> {
  try {
    const unipile = new UnipileService();
    const data = await unipile.listLinkedInUserPosts(params.accountId, params.providerId, {
      limit: 5,
    });

    for (const post of data.items ?? []) {
      const text = post.text?.trim();
      if (!text || text.length < 20) continue;
      if (post.is_repost && text.length < 60) continue;

      const freshnessDays = post.parsed_datetime
        ? daysSince(post.parsed_datetime)
        : undefined;
      if (freshnessDays !== undefined && freshnessDays > MAX_POST_AGE_DAYS) continue;

      return {
        type: "contact_post",
        text: text.slice(0, 280),
        source: "unipile_post",
        confidence: "high",
        freshnessDays,
      };
    }
  } catch (err) {
    console.warn("[personalization] fetchLatestContactPost failed:", err);
  }

  return null;
}
