import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { prospectContact, prospectOffer, prospectList, user } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import { inngest } from "$lib/inngest/client";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) {
    return json({ error: "Non authentifié" }, { status: 401 });
  }

  // Verify contact ownership
  const [row] = await db
    .select({
      id: prospectContact.id,
      linkedinUrl: prospectContact.linkedinUrl,
      fullName: prospectContact.fullName,
      listUserId: prospectList.userId,
      fullenrichApiKey: user.fullenrichApiKey,
    })
    .from(prospectContact)
    .innerJoin(prospectOffer, eq(prospectContact.offerId, prospectOffer.id))
    .innerJoin(prospectList, eq(prospectOffer.listId, prospectList.id))
    .innerJoin(user, eq(prospectList.userId, user.id))
    .where(eq(prospectContact.id, params.id))
    .limit(1);

  if (!row) return json({ error: "Contact introuvable" }, { status: 404 });
  if (row.listUserId !== locals.user.id) return json({ error: "Accès refusé" }, { status: 403 });
  if (!row.linkedinUrl && !row.fullName) {
    return json({ error: "Ajoutez au moins un nom ou une URL LinkedIn pour enrichir ce contact." }, { status: 400 });
  }
  if (!row.fullenrichApiKey) {
    return json({ error: "Clé API Fullenrich non configurée. Rendez-vous dans Paramètres." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({})) as { field?: "email" | "phone" };
  const field = body.field === "phone" ? "phone" : "email";

  // Send Inngest event — returns immediately, enrichment runs in background
  await inngest.send({
    name: "fullenrich/enrich",
    data: { contactId: params.id, field, userId: locals.user.id },
  });

  return json({ status: "pending", contactId: params.id, field });
};
