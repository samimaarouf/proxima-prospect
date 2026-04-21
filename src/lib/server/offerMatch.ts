import { db } from "$lib/server/db";
import { prospectList, prospectOffer } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";

/**
 * Server-side entry point for offer matching.  Pure utilities live in
 * `$lib/offerMatch.ts` (client-safe) and are re-exported here so existing
 * server code keeps working unchanged.
 */
export {
  type MinimalOffer,
  normalizeCompany,
  companyMatches,
  normalizeTitle,
  normalizeUrl,
  isSameOffer,
  findDuplicateOffers,
  buildOfferIndex,
} from "$lib/offerMatch";

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
