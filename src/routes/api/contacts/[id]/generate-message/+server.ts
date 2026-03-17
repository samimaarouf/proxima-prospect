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
    linkedin: "LinkedIn (connexion ou message direct). Le message doit faire MAXIMUM 300 caractères. Sois direct, humain et percutant.",
    whatsapp: "WhatsApp. Le message doit faire entre 100 et 250 mots. Sois direct et chaleureux.",
    email: "Email professionnel. Inclus un objet accrocheur sur la première ligne (format 'Objet: ...'). Le corps doit faire 150-200 mots.",
  };

  const systemPrompt = `Tu es un expert en chasse de têtes et en prospection B2B.
Tu rédiges des messages de prospection personnalisés pour ${recruiterName} de ${recruiterCompany}.

Contexte :
- L'entreprise cible cherche : ${offer.companyName}
- URL de l'offre : ${offer.offerUrl || "non fournie"}
${offer.offerContent ? `- Description du poste : ${offer.offerContent.substring(0, 500)}...` : ""}

Le recruteur se présente ainsi :
${pitch || `Je suis ${recruiterName} de ${recruiterCompany}, expert en recrutement.`}

Contact visé :
- Nom : ${contactName}
${contactJobTitle ? `- Titre : ${contactJobTitle}` : ""}
${linkedinSummary ? `- Résumé LinkedIn : ${linkedinSummary}` : ""}

Canal : ${channelInstructions[channel] || channelInstructions.linkedin}

Rédige UNIQUEMENT le message, sans introduction, sans guillemets, sans explication. Le message doit :
1. Montrer que tu as étudié leur profil/entreprise (personnalisation)
2. Expliquer que tu as vu leur offre de poste et que tu es expert pour les aider à trouver le bon candidat
3. Proposer un échange court (15 min)
4. Se terminer par le prénom du recruteur`;

  try {
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Génère le message de prospection." },
      ],
      max_tokens: channel === "email" ? 400 : 250,
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
