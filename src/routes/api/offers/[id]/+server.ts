import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { prospectOffer, prospectList } from "$lib/server/db/schema";
import { eq, and } from "drizzle-orm";
import type { RequestHandler } from "./$types";

export const DELETE: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) {
    return json({ error: "Non authentifié" }, { status: 401 });
  }

  // Verify the offer belongs to a list owned by the user
  const offer = await db
    .select({ id: prospectOffer.id, listId: prospectOffer.listId })
    .from(prospectOffer)
    .where(eq(prospectOffer.id, params.id))
    .limit(1);

  if (!offer.length) {
    return json({ error: "Offre introuvable" }, { status: 404 });
  }

  const list = await db
    .select({ id: prospectList.id })
    .from(prospectList)
    .where(and(eq(prospectList.id, offer[0].listId), eq(prospectList.userId, locals.user.id)))
    .limit(1);

  if (!list.length) {
    return json({ error: "Non autorisé" }, { status: 403 });
  }

  await db.delete(prospectOffer).where(eq(prospectOffer.id, params.id));

  return json({ success: true });
};
