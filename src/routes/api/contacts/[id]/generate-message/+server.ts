import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { prospectContact, prospectOffer, prospectList, user } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import OpenAI from "openai";
import { env } from "$env/dynamic/private";
import type { RequestHandler } from "./$types";

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

  // Get the offer for company and job info
  const offers = await db
    .select()
    .from(prospectOffer)
    .where(eq(prospectOffer.id, contact.offerId))
    .limit(1);

  const offer = offers[0];
  if (!offer) {
    return json({ error: "Offre introuvable" }, { status: 404 });
  }

  // Get list and user pitch
  const listResult = await db
    .select({ pitch: prospectList.pitch })
    .from(prospectList)
    .where(eq(prospectList.id, offer.listId))
    .limit(1);

  const pitch = listResult[0]?.pitch || "";

  // Get recruiter profile
  const userProfile = await db
    .select({ name: user.name, company: user.company })
    .from(user)
    .where(eq(user.id, locals.user.id))
    .limit(1);

  const recruiterName = userProfile[0]?.name || "Le recruteur";
  const recruiterCompany = userProfile[0]?.company || "notre entreprise";

  // Build the prompt
  const contactName = contact.fullName || "le/la décideur(se)";
  const contactJobTitle = contact.jobTitle || "";
  const linkedinSummary = contact.linkedinSummary || "";

  const channelInstructions: Record<string, string> = {
    linkedin: "LinkedIn (connexion ou message direct). MAXIMUM 300 caractères. Ultra-court : vu leur offre, on est spécialisé recrutement Sales, première sélection sous 72h. CTA direct.",
    whatsapp: "WhatsApp. 4-5 lignes max. Même structure que l'email mais condensée au maximum.",
    email: "Email professionnel. Inclus un objet percutant sur la première ligne (format 'Objet: ...'). Corps COURT : 5-7 lignes maximum.",
  };

  const systemPrompt = `Rôle : Tu es un Talent Acquisition Manager spécialisé dans la chasse de profils Sales à haut niveau. Tu rédiges des messages de prospection pour ${recruiterName} de ${recruiterCompany} (https://proxima-agents.com/).

Contexte :
- Contact : ${contactName}${contactJobTitle ? `, ${contactJobTitle}` : ""} chez ${offer.companyName}
- Offre : ${offer.offerTitle || "poste non précisé"}
${offer.offerContent ? `- Détail de l'offre : ${offer.offerContent.substring(0, 800)}` : ""}
${linkedinSummary ? `- Profil LinkedIn du contact : ${linkedinSummary}` : ""}
${pitch ? `- Pitch recruteur : ${pitch}` : ""}

Paramètres de ciblage à déduire intelligemment de l'offre :
- Profil type : expérience en années et type de vente précis (ex: 3-5 ans en vente B2B complexe)
- Secteur d'origine : secteur exact où chercher ces profils (ex: Climate Tech, SaaS RH, Fintech)
- Entreprises cibles : 3-4 vraies entreprises du même secteur/taille où ces profils Sales existent et où il faudrait sourcer

Ma proposition de valeur (à intégrer dans le message) :
- Spécialisation : recrutement exclusif de profils Sales (BizDev, Account Executive, Head of Sales)
- Méthode : outil de ciblage métier ultra-fin pour extraire les profils passés par ces entreprises cibles
- Vitesse : première sélection qualifiée sous 72h
- Modèle : zéro risque, pas d'abonnement, tarif au prix d'une cooptation interne, paiement uniquement si recrutement effectif

Canal : ${channelInstructions[channel] || channelInstructions.linkedin}

Structure du message (email/whatsapp) :
1. Accroche : référence directe à leur offre de [poste] chez [entreprise]
2. Preuve de compréhension : citer les entreprises cibles où sourcer, avec le profil type recherché
3. Solution : vitesse (72h) et précision de la méthode
4. Offre financière : zéro risque, paiement au recrutement uniquement, tarif cooptation
5. Appel à l'action : échange de 10 minutes cette semaine
6. Signature : ${recruiterName} + lien en HTML : <a href="https://proxima-agents.com/">proxima-agents.com</a>

Ton : sobre, expert, partenaire de confiance. Pas de jargon "IA" ou "révolutionnaire". Court et percutant.${extraInstructions ? `\n\nInstructions supplémentaires (prioritaires) :\n${extraInstructions}` : ""}

Rédige UNIQUEMENT le message final, sans introduction ni commentaire.`;

  try {
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Génère le message de prospection." },
      ],
      max_tokens: channel === "email" ? 450 : 220,
      temperature: 0.8,
    });

    let aiMessage = completion.choices[0]?.message?.content?.trim() || "";

    // Safety truncation for LinkedIn
    if (channel === "linkedin" && aiMessage.length > 300) {
      aiMessage = aiMessage.substring(0, 297) + "...";
    }

    // Save to DB
    const [updated] = await db
      .update(prospectContact)
      .set({
        aiMessage,
        updatedAt: new Date(),
      })
      .where(eq(prospectContact.id, params.id))
      .returning();

    return json(updated);
  } catch (err) {
    console.error("Message generation error:", err);
    return json(
      { error: err instanceof Error ? err.message : "Erreur lors de la génération" },
      { status: 500 }
    );
  }
};
