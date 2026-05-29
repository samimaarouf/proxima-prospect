import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { prospectContact, prospectOffer, prospectList, user } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import { chatComplete } from "$lib/server/aiChat";
import { generateColdEmail } from "$lib/server/agents/coldEmailAgent";
import { buildPersonalizationContext } from "$lib/server/personalization/buildContext";
import { cleanOfferTitle } from "$lib/server/personalization/prompts";
import { resolveOfferProposition } from "$lib/server/personalization/resolveOfferProposition";
import type { RequestHandler } from "./$types";

function firstNameFromFullName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts[0] || "";
}

export const POST: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) {
    return json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const channel: "linkedin" | "whatsapp" | "email" = body.channel || "linkedin";
  const extraInstructions: string = body.extraInstructions?.trim() || "";

  const contacts = await db
    .select()
    .from(prospectContact)
    .where(eq(prospectContact.id, params.id))
    .limit(1);

  if (!contacts.length) {
    return json({ error: "Contact introuvable" }, { status: 404 });
  }

  const contact = contacts[0];

  const offers = await db
    .select()
    .from(prospectOffer)
    .where(eq(prospectOffer.id, contact.offerId))
    .limit(1);

  const offer = offers[0];
  if (!offer) {
    return json({ error: "Offre introuvable" }, { status: 404 });
  }

  const listResult = await db
    .select({ pitch: prospectList.pitch })
    .from(prospectList)
    .where(eq(prospectList.id, offer.listId))
    .limit(1);

  const pitch = listResult[0]?.pitch || "";

  const userProfile = await db
    .select({
      name: user.name,
      company: user.company,
      senderFirstName: user.senderFirstName,
      unipileLinkedInAccountId: user.unipileLinkedInAccountId,
    })
    .from(user)
    .where(eq(user.id, locals.user.id))
    .limit(1);

  const rawRecruiterName = userProfile[0]?.name || "Le recruteur";
  const recruiterCompany = userProfile[0]?.company || "notre entreprise";
  const customSenderFirstName = userProfile[0]?.senderFirstName?.trim() || "";

  const contactName = contact.fullName || "le/la décideur(se)";
  const contactFirstName = firstNameFromFullName(contact.fullName || "") || "Madame/Monsieur";
  const recruiterFirstName =
    customSenderFirstName || firstNameFromFullName(rawRecruiterName) || rawRecruiterName;

  const recruiterName = (() => {
    if (!customSenderFirstName) return rawRecruiterName;
    const parts = rawRecruiterName.trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return customSenderFirstName;
    return [customSenderFirstName, ...parts.slice(1)].join(" ");
  })();
  const contactJobTitle = contact.jobTitle || "";
  const linkedinSummary = contact.linkedinSummary || "";

  // ── LinkedIn : court, distinct de WhatsApp / email ; stocké dans ai_message_linkedin ──
  if (channel === "linkedin") {
    const offerTitleClean = cleanOfferTitle(
      offer.offerTitle || contactJobTitle || "poste",
    );
    const offerProposition = await resolveOfferProposition({
      companyName: offer.companyName,
      offerTitle: offerTitleClean,
      offerExcerpt: offer.offerContent?.trim().slice(0, 500) ?? "",
      offerLocation: offer.offerLocation,
      pitch,
    });

    const linkedinSystemPrompt = `Tu es un chasseur de têtes spécialisé ${offerProposition.recruiterSpecialty}. Tu rédiges une note d'invitation LinkedIn (connexion) que ${recruiterName} enverra.

CONTRAINTE ABSOLUE : le message final doit faire STRICTEMENT moins de 300 caractères (espaces inclus), sans saut de ligne (une seule ligne ou tout sur une ligne).

RÈGLE CRITIQUE — SALUTATION :
- Après "Bonjour", tu utilises UNIQUEMENT le prénom du DÉCIDEUR / destinataire fourni dans les données utilisateur (variable "prénom du client").
- Tu ne salues JAMAIS avec le prénom ou le nom du recruteur (${recruiterFirstName} / ${recruiterName}).

SIGNATURE :
- En fin de message uniquement, signe brièvement avec le prénom du recruteur : ${recruiterFirstName} (ou les initiales si l'espace manque).

CONTENU :
- Mentionner que tu as repéré l'offre (titre court du poste) chez l'entreprise cible.
- Une phrase sur le fait que tu as des ${offerProposition.recruiterSpecialty} alignés / à proposer.
- Proposition courte d'échange. Ton professionnel, direct.

INTERDIT : confondre recruteur et client, inventer un prénom client différent de celui fourni.${extraInstructions ? `\n\nInstructions supplémentaires :\n${extraInstructions}` : ""}`;

    const linkedinUserPayload = `Génère le message LinkedIn avec ces données factuelles :
- Prénom du CLIENT (destinataire, à mettre après "Bonjour") : ${contactFirstName}
- Nom complet client (référence) : ${contactName}
- Entreprise : ${offer.companyName}
- Poste à pourvoir (raccourcis si besoin) : ${offerTitleClean}
${linkedinSummary ? `- Résumé profil LinkedIn : ${linkedinSummary.slice(0, 400)}` : ""}`;

    try {
      let aiLinkedin = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        aiLinkedin = await chatComplete({
          systemPrompt: linkedinSystemPrompt,
          userPrompt:
            attempt === 0
              ? linkedinUserPayload
              : `Le message précédent était trop long. Raccourcis-le pour qu'il fasse strictement moins de 300 caractères. Message actuel : "${aiLinkedin}"`,
          maxTokens: 200,
          temperature: 0.5,
        });
        if (aiLinkedin.length <= 300) break;
      }
      if (aiLinkedin.length > 300) aiLinkedin = aiLinkedin.substring(0, 297) + "…";

      const [updated] = await db
        .update(prospectContact)
        .set({ aiMessageLinkedin: aiLinkedin, updatedAt: new Date() })
        .where(eq(prospectContact.id, params.id))
        .returning();

      return json(updated);
    } catch (err) {
      console.error("LinkedIn message generation error:", err);
      return json(
        { error: err instanceof Error ? err.message : "Erreur lors de la génération" },
        { status: 500 }
      );
    }
  }

  // ── WhatsApp / Email : agent cold email spécialisé ───────────────────────────
  try {
    const ctx = await buildPersonalizationContext({
      contact,
      offer,
      pitch,
      recruiterName,
      recruiterFirstName,
      recruiterCompany,
      unipileLinkedInAccountId: userProfile[0]?.unipileLinkedInAccountId,
      fetchPosts: channel === "email",
    });

    const { message: aiMessage, warnings, styleVariant } = await generateColdEmail({
      ctx,
      channel,
      contactId: params.id,
      extraInstructions,
    });

    const [updated] = await db
      .update(prospectContact)
      .set({ aiMessage, updatedAt: new Date() })
      .where(eq(prospectContact.id, params.id))
      .returning();

    return json({
      ...updated,
      personalization: {
        qualityScore: ctx.qualityScore,
        segment: ctx.segment,
        roleFamily: ctx.offerProposition.roleFamily,
        offerPropositionSource: ctx.offerProposition.source,
        styleVariant,
        signalsUsed: ctx.signals.map((s) => s.type),
        warnings,
      },
    });
  } catch (err) {
    console.error("Message generation error:", err);
    return json(
      { error: err instanceof Error ? err.message : "Erreur lors de la génération" },
      { status: 500 }
    );
  }
};
