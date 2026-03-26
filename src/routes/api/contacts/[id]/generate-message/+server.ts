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

  const emailExample = `Bonjour [Prénom],

J'ai pris connaissance de votre offre pour un [Intitulé du poste] chez [Entreprise]. Pour [mission clé du poste], je sais que le défi est de trouver un profil capable de [compétence critique liée au poste].

Spécialisé exclusivement sur les profils Sales, j'utilise un outil de sourcing par IA qui me permet de définir des critères métier très fins pour identifier ces talents sur l'ensemble des réseaux. Cela me permet de vous soumettre une première sélection qualifiée sous 3 jours.

Mon approche est pensée pour être une aide directe à votre croissance, sans aucun risque :

Facturation uniquement au succès : Vous ne payez qu'au recrutement effectif, pas avant.
Tarif transparent : Un prix fixe aligné sur celui d'une cooptation interne (pas d'abonnement, pas de frais de dossier).
Zéro risque financier : Si vous n'embauchez pas, vous ne nous devez rien.

Seriez-vous ouvert à un échange de 10 minutes cette semaine pour que je vous montre la pertinence des profils identifiés pour ce poste ?

Bien à vous,
${recruiterName}`;

  const channelInstructions: Record<string, string> = {
    linkedin: "LinkedIn (connexion ou message direct). MAXIMUM 300 caractères. Résume l'essentiel : qui tu es, que tu as vu leur offre, et propose un échange de 10 min. Sois direct et percutant.",
    whatsapp: "WhatsApp. Entre 80 et 150 mots. Reprends la structure email mais condensée : accroche sur l'offre, valeur ajoutée, CTA 10 min. Ton chaleureux et direct.",
    email: `Email professionnel. Inclus un objet accrocheur sur la première ligne (format 'Objet: ...'). Corps de 150-250 mots. Respecte scrupuleusement la structure et le ton de cet exemple :\n\n${emailExample}`,
  };

  const systemPrompt = `Tu es un expert en chasse de têtes et en prospection B2B.
Tu rédiges des messages de prospection personnalisés pour ${recruiterName} de ${recruiterCompany}.

Contexte de l'offre :
- Entreprise cible : ${offer.companyName}
- Titre du poste : ${offer.offerTitle || "non précisé"}
- URL de l'offre : ${offer.offerUrl || "non fournie"}
${offer.offerContent ? `- Description : ${offer.offerContent.substring(0, 600)}` : ""}

Pitch du recruteur :
${pitch || `${recruiterName} est un expert en recrutement chez ${recruiterCompany}, spécialisé dans l'identification de talents via IA.`}

Contact visé :
- Nom : ${contactName}
${contactJobTitle ? `- Titre : ${contactJobTitle}` : ""}
${linkedinSummary ? `- Résumé LinkedIn : ${linkedinSummary}` : ""}

Canal : ${channelInstructions[channel] || channelInstructions.linkedin}

Rédige UNIQUEMENT le message final, sans introduction, sans guillemets, sans commentaire.
Le message doit :
1. Ouvrir en mentionnant précisément l'offre et l'entreprise (personnalisation réelle)
2. Montrer que tu comprends le défi de recrutement lié à ce poste spécifique
3. Présenter la valeur ajoutée du recruteur : TOUJOURS indiquer qu'il est "spécialisé exclusivement sur les profils Sales" — ne jamais adapter cette spécialisation au secteur de l'entreprise cible
4. Pour email/whatsapp : inclure les 3 points risk-free (succès, tarif fixe, sans engagement)
5. Terminer par un CTA pour un échange de 10 minutes cette semaine
6. Signer avec le prénom du recruteur uniquement${extraInstructions ? `\n\nInstructions supplémentaires (prioritaires) :\n${extraInstructions}` : ""}`;

  try {
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Génère le message de prospection." },
      ],
      max_tokens: channel === "email" ? 600 : 280,
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
