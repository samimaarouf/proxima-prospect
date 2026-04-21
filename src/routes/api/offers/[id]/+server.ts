import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { prospectOffer, prospectList } from "$lib/server/db/schema";
import { eq, and } from "drizzle-orm";
import type { RequestHandler } from "./$types";

async function assertOwnership(offerId: string, userId: string) {
  const rows = await db
    .select({ id: prospectOffer.id, listId: prospectOffer.listId })
    .from(prospectOffer)
    .innerJoin(prospectList, eq(prospectList.id, prospectOffer.listId))
    .where(and(eq(prospectOffer.id, offerId), eq(prospectList.userId, userId)))
    .limit(1);
  return rows[0] || null;
}

export const DELETE: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) {
    return json({ error: "Non authentifié" }, { status: 401 });
  }

  const owned = await assertOwnership(params.id, locals.user.id);
  if (!owned) {
    return json({ error: "Offre introuvable" }, { status: 404 });
  }

  await db.delete(prospectOffer).where(eq(prospectOffer.id, params.id));

  return json({ success: true });
};

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) {
    return json({ error: "Non authentifié" }, { status: 401 });
  }

  const owned = await assertOwnership(params.id, locals.user.id);
  if (!owned) {
    return json({ error: "Offre introuvable" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    disabled?: boolean;
  };

  const patch: Partial<typeof prospectOffer.$inferInsert> = {};
  if (typeof body.disabled === "boolean") {
    patch.disabledAt = body.disabled ? new Date() : null;
  }

  if (Object.keys(patch).length === 0) {
    return json({ error: "Aucun champ à mettre à jour" }, { status: 400 });
  }

  const [updated] = await db
    .update(prospectOffer)
    .set(patch)
    .where(eq(prospectOffer.id, params.id))
    .returning();

  return json(updated);
};
