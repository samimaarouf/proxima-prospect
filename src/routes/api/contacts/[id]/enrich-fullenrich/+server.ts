import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { prospectContact, prospectOffer, prospectList, user } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "./$types";

const FULLENRICH_API = "https://app.fullenrich.com/api/v2";
const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 20;

export const POST: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) {
    return json({ error: "Non authentifié" }, { status: 401 });
  }

  // Verify contact belongs to current user
  const [contact] = await db
    .select({
      id: prospectContact.id,
      linkedinUrl: prospectContact.linkedinUrl,
      fullName: prospectContact.fullName,
      offerId: prospectContact.offerId,
    })
    .from(prospectContact)
    .innerJoin(prospectOffer, eq(prospectContact.offerId, prospectOffer.id))
    .innerJoin(prospectList, eq(prospectOffer.listId, prospectList.id))
    .where(eq(prospectContact.id, params.id))
    .limit(1);

  if (!contact) {
    return json({ error: "Contact introuvable" }, { status: 404 });
  }

  // Verify ownership via list
  const [list] = await db
    .select({ userId: prospectList.userId })
    .from(prospectList)
    .innerJoin(prospectOffer, eq(prospectOffer.listId, prospectList.id))
    .where(eq(prospectOffer.id, contact.offerId))
    .limit(1);

  if (!list || list.userId !== locals.user.id) {
    return json({ error: "Accès refusé" }, { status: 403 });
  }

  if (!contact.linkedinUrl) {
    return json({ error: "Ce contact n'a pas d'URL LinkedIn" }, { status: 400 });
  }

  // Get user's Fullenrich API key
  const [userProfile] = await db
    .select({ fullenrichApiKey: user.fullenrichApiKey })
    .from(user)
    .where(eq(user.id, locals.user.id))
    .limit(1);

  if (!userProfile?.fullenrichApiKey) {
    return json(
      { error: "Clé API Fullenrich non configurée. Rendez-vous dans Paramètres." },
      { status: 400 }
    );
  }

  const apiKey = userProfile.fullenrichApiKey;

  try {
    // Start enrichment
    const enrichRes = await fetch(`${FULLENRICH_API}/contact/enrich/bulk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        name: contact.fullName
          ? `Enrichissement – ${contact.fullName}`
          : `Enrichissement – contact ${params.id}`,
        data: [
          {
            linkedin_url: contact.linkedinUrl,
            enrich_fields: ["contact.emails", "contact.phones"],
            custom: { contact_id: params.id },
          },
        ],
      }),
    });

    if (!enrichRes.ok) {
      const err = await enrichRes.json().catch(() => ({}));
      return json(
        { error: (err as { message?: string }).message || "Erreur Fullenrich" },
        { status: enrichRes.status }
      );
    }

    const { enrichment_id } = (await enrichRes.json()) as { enrichment_id: string };

    // Poll for result
    let result: FullenrichResult | null = null;
    for (let i = 0; i < MAX_POLLS; i++) {
      await sleep(POLL_INTERVAL_MS);

      const pollRes = await fetch(
        `${FULLENRICH_API}/contact/enrich/bulk/${enrichment_id}`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );

      if (!pollRes.ok) continue;

      const data = (await pollRes.json()) as FullenrichBulkResult;

      // Check if all contacts are processed
      const contacts = data.contacts ?? [];
      if (contacts.length > 0 && contacts.every((c) => c.status === "done" || c.status === "error")) {
        result = contacts[0] ?? null;
        break;
      }
    }

    if (!result) {
      return json(
        { error: "L'enrichissement a pris trop de temps. Réessayez dans quelques instants." },
        { status: 408 }
      );
    }

    // Extract best email and phone
    const email = result.most_probable_email ?? result.emails?.[0]?.email ?? null;
    const phone = result.most_probable_phone ?? result.phones?.[0]?.number ?? null;

    if (!email && !phone) {
      return json(
        { error: "Aucun email ni téléphone trouvé pour ce contact." },
        { status: 404 }
      );
    }

    // Update contact in DB (only overwrite fields that were found)
    const [updated] = await db
      .update(prospectContact)
      .set({
        ...(email ? { email } : {}),
        ...(phone ? { phone1: phone } : {}),
        updatedAt: new Date(),
      })
      .where(eq(prospectContact.id, params.id))
      .returning();

    return json({ ...updated, _enriched: { email, phone } });
  } catch (err) {
    console.error("Fullenrich enrichment error:", err);
    return json(
      { error: err instanceof Error ? err.message : "Erreur lors de l'enrichissement" },
      { status: 500 }
    );
  }
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface FullenrichEmail {
  email: string;
  status: string;
}

interface FullenrichPhone {
  number: string;
  region?: string;
}

interface FullenrichResult {
  status?: string;
  most_probable_email?: string | null;
  most_probable_phone?: string | null;
  emails?: FullenrichEmail[];
  phones?: FullenrichPhone[];
}

interface FullenrichBulkResult {
  contacts?: FullenrichResult[];
}
