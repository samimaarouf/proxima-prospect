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

  const systemPrompt = `Tu es un chasseur de têtes spécialisé en recrutement commercial (Sales).
Tu rédiges des messages de prospection courts et directs pour ${recruiterName} de ${recruiterCompany} (site : https://proxima-agents.com/).

Contexte de l'offre :
- Entreprise : ${offer.companyName}
- Poste : ${offer.offerTitle || "non précisé"}
${offer.offerContent ? `- Description : ${offer.offerContent.substring(0, 800)}` : ""}

Contact :
- Nom : ${contactName}
${contactJobTitle ? `- Titre : ${contactJobTitle}` : ""}
${linkedinSummary ? `- Résumé LinkedIn : ${linkedinSummary}` : ""}

Pitch recruteur :
${pitch || `${recruiterName} — recrutement spécialisé profils Sales, chez ${recruiterCompany}.`}

Canal : ${channelInstructions[channel] || channelInstructions.linkedin}

Structure OBLIGATOIRE (email/whatsapp) — respecte scrupuleusement cet ordre et ce ton :

"Bonjour [Prénom],

J'ai vu votre recherche pour un [Intitulé du poste]. Spécialisé exclusivement sur les profils Sales, j'accompagne [type d'entreprise déduit de l'offre] pour identifier des talents capables de [mission/compétence clé déduite de l'offre].

Grâce à notre outil de ciblage personnalisé, je peux vous présenter sous 3 jours des profils ayant déjà l'expérience sectorielle requise (type [2-3 entreprises similaires pertinentes]).

Mon approche est simple :

Zéro risque : Vous ne payez que si vous recrutez le candidat proposé.
Coût maîtrisé : Un tarif fixe aligné sur celui d'une cooptation interne.

Seriez-vous ouvert à un échange de 10 minutes cette semaine ?

Bien à vous,
[Prénom du recruteur]"

En bas du message, ajoute discrètement le lien en HTML : <a href="https://proxima-agents.com/">proxima-agents.com</a>

RÈGLES STRICTES :
- Respecte exactement cette structure, dans cet ordre
- Les éléments entre crochets sont à personnaliser à partir du contenu de l'offre
- "Zéro risque" et "Coût maîtrisé" sont des libellés fixes, ne pas les modifier
- Spécialisation TOUJOURS "profils Sales" — jamais le secteur de l'entreprise cible
- Ne jamais inventer des informations absentes de l'offre${extraInstructions ? `\n\nInstructions supplémentaires (prioritaires) :\n${extraInstructions}` : ""}`;

  try {
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Génère le message de prospection." },
      ],
      max_tokens: channel === "email" ? 350 : 200,
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
