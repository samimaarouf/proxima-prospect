import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { prospectContact, prospectOffer, prospectList } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) return json({ error: "Non authentifié" }, { status: 401 });

  const [row] = await db
    .select({
      id: prospectContact.id,
      email: prospectContact.email,
      phone1: prospectContact.phone1,
      updatedAt: prospectContact.updatedAt,
      listUserId: prospectList.userId,
    })
    .from(prospectContact)
    .innerJoin(prospectOffer, eq(prospectContact.offerId, prospectOffer.id))
    .innerJoin(prospectList, eq(prospectOffer.listId, prospectList.id))
    .where(eq(prospectContact.id, params.id))
    .limit(1);

  if (!row) return json({ error: "Contact introuvable" }, { status: 404 });
  if (row.listUserId !== locals.user.id) return json({ error: "Accès refusé" }, { status: 403 });

  return json({ email: row.email, phone1: row.phone1, updatedAt: row.updatedAt });
};
