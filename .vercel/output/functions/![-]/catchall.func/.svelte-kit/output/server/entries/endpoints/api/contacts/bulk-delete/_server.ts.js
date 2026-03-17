import { json } from "@sveltejs/kit";
import { d as db, p as prospectContact, a as prospectOffer, b as prospectList } from "../../../../../chunks/index2.js";
import { inArray } from "drizzle-orm";
const POST = async ({ locals, request }) => {
  if (!locals.user) return json({ error: "Non authentifié" }, { status: 401 });
  const { ids } = await request.json();
  if (!ids?.length) return json({ error: "Aucun ID fourni" }, { status: 400 });
  const contacts = await db.select({ id: prospectContact.id, offerId: prospectContact.offerId }).from(prospectContact).where(inArray(prospectContact.id, ids));
  const offerIds = [...new Set(contacts.map((c) => c.offerId))];
  const offers = await db.select({ id: prospectOffer.id, listId: prospectOffer.listId }).from(prospectOffer).where(inArray(prospectOffer.id, offerIds));
  const listIds = [...new Set(offers.map((o) => o.listId))];
  const lists = await db.select({ id: prospectList.id, userId: prospectList.userId }).from(prospectList).where(inArray(prospectList.id, listIds));
  const unauthorized = lists.some((l) => l.userId !== locals.user.id);
  if (unauthorized) return json({ error: "Accès refusé" }, { status: 403 });
  await db.delete(prospectContact).where(inArray(prospectContact.id, ids));
  return json({ success: true, deleted: ids.length });
};
export {
  POST
};
