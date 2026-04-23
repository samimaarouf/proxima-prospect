import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { prospectOffer, prospectContact, prospectList } from "$lib/server/db/schema";
import { eq, and } from "drizzle-orm";
import type { RequestHandler } from "./$types";
import { normalizeLinkedInUrl, nameFromLinkedInSlug, looksLikeJobTitleNotName } from "$lib/linkedinUrl";

export const POST: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) return json({ error: "Non authentifié" }, { status: 401 });

  // Verify offer ownership via list
  const [offer] = await db
    .select({ id: prospectOffer.id, listId: prospectOffer.listId })
    .from(prospectOffer)
    .where(eq(prospectOffer.id, params.id))
    .limit(1);

  if (!offer) return json({ error: "Offre introuvable" }, { status: 404 });

  const [list] = await db
    .select({ userId: prospectList.userId })
    .from(prospectList)
    .where(and(eq(prospectList.id, offer.listId), eq(prospectList.userId, locals.user.id)))
    .limit(1);

  if (!list) return json({ error: "Accès refusé" }, { status: 403 });

  const body = await request.json();
  const { linkedinUrl, fullName, jobTitle, email } = body as {
    linkedinUrl?: string;
    fullName?: string;
    jobTitle?: string;
    email?: string;
  };

  const normalizedUrl = normalizeLinkedInUrl(linkedinUrl ?? null);

  // If the provided fullName looks like a job title (e.g. "Account Executive"
  // leaked from the offer title), or is missing entirely, fall back to the
  // name derived from the LinkedIn slug.
  let finalFullName: string | null = fullName?.trim() || null;
  if (looksLikeJobTitleNotName(finalFullName, jobTitle ?? null)) {
    finalFullName = nameFromLinkedInSlug(normalizedUrl) ?? finalFullName;
  }

  const [contact] = await db
    .insert(prospectContact)
    .values({
      offerId: params.id,
      linkedinUrl: normalizedUrl,
      fullName: finalFullName,
      jobTitle: jobTitle || null,
      email: email || null,
      contactStatus: "undefined",
    })
    .returning();

  return json(contact);
};
