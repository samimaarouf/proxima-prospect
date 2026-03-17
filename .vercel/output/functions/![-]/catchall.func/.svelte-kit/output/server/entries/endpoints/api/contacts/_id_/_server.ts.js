import { json } from "@sveltejs/kit";
import { d as db, p as prospectContact, a as prospectOffer, b as prospectList } from "../../../../../chunks/index2.js";
import { eq } from "drizzle-orm";
const DELETE = async ({ locals, params }) => {
  if (!locals.user) return json({ error: "Non authentifié" }, { status: 401 });
  const contact = await db.select({ offerId: prospectContact.offerId }).from(prospectContact).where(eq(prospectContact.id, params.id)).limit(1);
  if (!contact.length) return json({ error: "Contact introuvable" }, { status: 404 });
  const offer = await db.select({ listId: prospectOffer.listId }).from(prospectOffer).where(eq(prospectOffer.id, contact[0].offerId)).limit(1);
  if (!offer.length) return json({ error: "Offre introuvable" }, { status: 404 });
  const list = await db.select({ userId: prospectList.userId }).from(prospectList).where(eq(prospectList.id, offer[0].listId)).limit(1);
  if (!list.length || list[0].userId !== locals.user.id) {
    return json({ error: "Accès refusé" }, { status: 403 });
  }
  await db.delete(prospectContact).where(eq(prospectContact.id, params.id));
  return json({ success: true });
};
export {
  DELETE
};
