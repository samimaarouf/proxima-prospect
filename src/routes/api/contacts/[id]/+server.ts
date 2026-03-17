import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { prospectContact, prospectOffer, prospectList } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "./$types";

export const DELETE: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) return json({ error: "Non authentifié" }, { status: 401 });

  // Verify ownership via offer → list → user
  const contact = await db
    .select({ offerId: prospectContact.offerId })
    .from(prospectContact)
    .where(eq(prospectContact.id, params.id))
    .limit(1);

  if (!contact.length) return json({ error: "Contact introuvable" }, { status: 404 });

  const offer = await db
    .select({ listId: prospectOffer.listId })
    .from(prospectOffer)
    .where(eq(prospectOffer.id, contact[0].offerId))
    .limit(1);

  if (!offer.length) return json({ error: "Offre introuvable" }, { status: 404 });

  const list = await db
    .select({ userId: prospectList.userId })
    .from(prospectList)
    .where(eq(prospectList.id, offer[0].listId))
    .limit(1);

  if (!list.length || list[0].userId !== locals.user.id) {
    return json({ error: "Accès refusé" }, { status: 403 });
  }

  await db.delete(prospectContact).where(eq(prospectContact.id, params.id));
  return json({ success: true });
};
