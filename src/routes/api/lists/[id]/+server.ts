import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { prospectList, prospectOffer, prospectContact } from "$lib/server/db/schema";
import { eq, and } from "drizzle-orm";
import type { RequestHandler } from "./$types";
import { findDuplicateOffers, loadUserOffers } from "$lib/server/offerMatch";

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) {
    return json({ error: "Non authentifié" }, { status: 401 });
  }

  const list = await db
    .select()
    .from(prospectList)
    .where(and(eq(prospectList.id, params.id), eq(prospectList.userId, locals.user.id)))
    .limit(1);

  if (!list.length) {
    return json({ error: "Liste introuvable" }, { status: 404 });
  }

  const offersRaw = await db
    .select()
    .from(prospectOffer)
    .where(eq(prospectOffer.listId, params.id));

  // Flag rows where the same company exists in ANOTHER list (same-list
  // matches are shown via the "N offres" group badge instead of yellow).
  const allUserOffers = await loadUserOffers(locals.user.id);
  const otherListOffers = allUserOffers.filter((o) => o.listId !== params.id);
  const offers = offersRaw.map((o) => {
    const duplicates = findDuplicateOffers(o, otherListOffers).map((d) => ({
      id: d.id,
      listId: d.listId,
      listName: d.listName,
      offerTitle: d.offerTitle,
      offerUrl: d.offerUrl,
      companyName: d.companyName,
    }));
    return { ...o, hasOtherOffer: duplicates.length > 0, duplicateOffers: duplicates };
  });

  const offerIds = offers.map((o) => o.id);

  let contacts: typeof prospectContact.$inferSelect[] = [];
  if (offerIds.length > 0) {
    const allContacts = await Promise.all(
      offerIds.map((offerId) =>
        db.select().from(prospectContact).where(eq(prospectContact.offerId, offerId))
      )
    );
    contacts = allContacts.flat();
  }

  const contactsWithOffer = contacts.map((c) => {
    const offer = offers.find((o) => o.id === c.offerId);
    return {
      ...c,
      companyName: offer?.companyName || "",
      offerUrl: offer?.offerUrl || "",
    };
  });

  return json({ list: list[0], offers, contacts: contactsWithOffer });
};

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) {
    return json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json();
  const { name, pitch } = body;

  const [updated] = await db
    .update(prospectList)
    .set({
      ...(name ? { name } : {}),
      ...(pitch !== undefined ? { pitch } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(prospectList.id, params.id), eq(prospectList.userId, locals.user.id)))
    .returning();

  return json(updated);
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) {
    return json({ error: "Non authentifié" }, { status: 401 });
  }

  await db
    .delete(prospectList)
    .where(and(eq(prospectList.id, params.id), eq(prospectList.userId, locals.user.id)));

  return json({ success: true });
};
