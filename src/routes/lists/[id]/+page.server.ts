import { redirect, error } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { prospectList, prospectOffer, prospectContact, user } from "$lib/server/db/schema";
import { eq, and } from "drizzle-orm";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.user) {
    throw redirect(302, "/login");
  }

  const lists = await db
    .select()
    .from(prospectList)
    .where(and(eq(prospectList.id, params.id), eq(prospectList.userId, locals.user.id)))
    .limit(1);

  if (!lists.length) {
    throw error(404, "Liste introuvable");
  }

  const list = lists[0];

  const offers = await db
    .select()
    .from(prospectOffer)
    .where(eq(prospectOffer.listId, params.id));

  const offerIds = offers.map((o) => o.id);
  let contacts: (typeof prospectContact.$inferSelect & { companyName: string; offerUrl: string | null })[] = [];

  if (offerIds.length > 0) {
    const allContacts = await Promise.all(
      offerIds.map((offerId) =>
        db.select().from(prospectContact).where(eq(prospectContact.offerId, offerId))
      )
    );
    contacts = allContacts.flat().map((c) => {
      const offer = offers.find((o) => o.id === c.offerId);
      return { ...c, companyName: offer?.companyName || "", offerUrl: offer?.offerUrl || null };
    });
  }

  const userProfile = await db
    .select({ name: user.name, company: user.company, unipileLinkedInAccountId: user.unipileLinkedInAccountId, unipileWhatsAppAccountId: user.unipileWhatsAppAccountId })
    .from(user)
    .where(eq(user.id, locals.user.id))
    .limit(1);

  // Group contacts by offerId for the offer sheet
  const contactsByOffer: Record<string, typeof contacts> = {};
  for (const c of contacts) {
    if (!contactsByOffer[c.offerId]) contactsByOffer[c.offerId] = [];
    contactsByOffer[c.offerId].push(c);
  }

  return { list, offers, contacts, contactsByOffer, userProfile: userProfile[0] || null };
};
