import { json } from "@sveltejs/kit";
import { d as db, b as prospectList, a as prospectOffer, p as prospectContact } from "../../../../../chunks/index2.js";
import { and, eq } from "drizzle-orm";
const GET = async ({ locals, params }) => {
  if (!locals.user) {
    return json({ error: "Non authentifié" }, { status: 401 });
  }
  const list = await db.select().from(prospectList).where(and(eq(prospectList.id, params.id), eq(prospectList.userId, locals.user.id))).limit(1);
  if (!list.length) {
    return json({ error: "Liste introuvable" }, { status: 404 });
  }
  const offers = await db.select().from(prospectOffer).where(eq(prospectOffer.listId, params.id));
  const offerIds = offers.map((o) => o.id);
  let contacts = [];
  if (offerIds.length > 0) {
    const allContacts = await Promise.all(
      offerIds.map(
        (offerId) => db.select().from(prospectContact).where(eq(prospectContact.offerId, offerId))
      )
    );
    contacts = allContacts.flat();
  }
  const contactsWithOffer = contacts.map((c) => {
    const offer = offers.find((o) => o.id === c.offerId);
    return {
      ...c,
      companyName: offer?.companyName || "",
      offerUrl: offer?.offerUrl || ""
    };
  });
  return json({ list: list[0], offers, contacts: contactsWithOffer });
};
const PATCH = async ({ locals, params, request }) => {
  if (!locals.user) {
    return json({ error: "Non authentifié" }, { status: 401 });
  }
  const body = await request.json();
  const { name, pitch } = body;
  const [updated] = await db.update(prospectList).set({
    ...name ? { name } : {},
    ...pitch !== void 0 ? { pitch } : {},
    updatedAt: /* @__PURE__ */ new Date()
  }).where(and(eq(prospectList.id, params.id), eq(prospectList.userId, locals.user.id))).returning();
  return json(updated);
};
const DELETE = async ({ locals, params }) => {
  if (!locals.user) {
    return json({ error: "Non authentifié" }, { status: 401 });
  }
  await db.delete(prospectList).where(and(eq(prospectList.id, params.id), eq(prospectList.userId, locals.user.id)));
  return json({ success: true });
};
export {
  DELETE,
  GET,
  PATCH
};
