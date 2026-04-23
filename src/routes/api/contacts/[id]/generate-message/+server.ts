import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { prospectContact, prospectOffer, prospectList, user } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import OpenAI from "openai";
import { env } from "$env/dynamic/private";
import { chatComplete } from "$lib/server/aiChat";
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
    .select({ name: user.name, company: user.company, senderFirstName: user.senderFirstName })
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

  // Si l'utilisateur a défini un prénom d'expéditeur personnalisé, on remplace
  // la première partie du nom complet pour éviter que l'IA ne mélange les prénoms
  // (ex : "Sami Maarouf" + override "Alex" → "Alex Maarouf").
  const recruiterName = (() => {
    if (!customSenderFirstName) return rawRecruiterName;
    const parts = rawRecruiterName.trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return customSenderFirstName;
    return [customSenderFirstName, ...parts.slice(1)].join(" ");
  })();
  const contactJobTitle = contact.jobTitle || "";
  const linkedinSummary = contact.linkedinSummary || "";

  // OpenAI client is kept only for the web-search hook (cheap + reliable).
  // Message generation itself now goes through `chatComplete` which prefers
  // Claude Sonnet 4.5 when `ANTHROPIC_API_KEY` is set.
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  // ── LinkedIn : court, distinct de WhatsApp / email ; stocké dans ai_message_linkedin ──
  if (channel === "linkedin") {
    const linkedinSystemPrompt = `Tu es un chasseur de têtes spécialisé profils Sales. Tu rédiges une note d'invitation LinkedIn (connexion) que ${recruiterName} enverra.

CONTRAINTE ABSOLUE : le message final doit faire STRICTEMENT moins de 300 caractères (espaces inclus), sans saut de ligne (une seule ligne ou tout sur une ligne).

RÈGLE CRITIQUE — SALUTATION :
- Après "Bonjour", tu utilises UNIQUEMENT le prénom du DÉCIDEUR / destinataire fourni dans les données utilisateur (variable "prénom du client").
- Tu ne salues JAMAIS avec le prénom ou le nom du recruteur (${recruiterFirstName} / ${recruiterName}).

SIGNATURE :
- En fin de message uniquement, signe brièvement avec le prénom du recruteur : ${recruiterFirstName} (ou les initiales si l'espace manque).

CONTENU :
- Mentionner que tu as repéré l'offre (titre court du poste) chez l'entreprise cible.
- Une phrase sur le fait que tu as des profils Sales alignés / à proposer.
- Proposition courte d'échange. Ton professionnel, direct.

INTERDIT : confondre recruteur et client, inventer un prénom client différent de celui fourni.${extraInstructions ? `\n\nInstructions supplémentaires :\n${extraInstructions}` : ""}`;

    const linkedinUserPayload = `Génère le message LinkedIn avec ces données factuelles :
- Prénom du CLIENT (destinataire, à mettre après "Bonjour") : ${contactFirstName}
- Nom complet client (référence) : ${contactName}
- Entreprise : ${offer.companyName}
- Poste à pourvoir (raccourcis si besoin) : ${offer.offerTitle || contactJobTitle || "poste Sales"}
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

  // ── WhatsApp / Email : web search hook + full template ───────────────────────
  let companyHook = "";
  try {
    const searchResponse = await (openai as any).responses.create({
      model: "gpt-4o-mini",
      tools: [{ type: "web_search_preview" }],
      input: `Fais une recherche rapide sur l'entreprise "${offer.companyName}" et son offre de recrutement pour un "${offer.offerTitle || "poste Sales"}".
Trouve un élément concret et récent qui expliquerait POURQUOI ils recrutent maintenant :
- Levée de fonds récente ?
- Départ d'un collaborateur Sales notable ?
- Croissance annoncée / expansion géographique ?
- Contrat signé / nouveau marché ?
Réponds en 1-2 phrases FACTUELLES et PRÉCISES que je pourrai glisser dans un email de prospection. Si tu ne trouves rien de concret, réponds juste "rien de trouvé".`,
    });
    const hookText: string = searchResponse.output_text?.trim() || "";
    if (hookText && hookText.toLowerCase() !== "rien de trouvé") {
      companyHook = hookText;
    }
  } catch {
    // Search not available or failed — continue without hook
  }

  // WhatsApp et email : même modèle de texte ; l'objet sert aussi pour réutiliser le corps sur WhatsApp (l'UI extrait le corps).
  const longChannelInstructions =
    "Message pour email OU WhatsApp : même contenu. Première ligne obligatoire : 'Objet: …' (accroche percutante). Saut de ligne, puis corps professionnel court : 6-8 lignes. Le corps (après l'objet) sera réutilisé tel quel pour WhatsApp.";

  const systemPrompt = `Rôle : Tu es un chasseur de têtes spécialisé exclusivement dans les profils Sales. Style : partenaire d'affaires — direct, sobre, sans fioritures, extrêmement pragmatique. Tu écris pour ${recruiterName}.

Contexte :
- Entreprise cible : ${offer.companyName}
- Interlocuteur : ${contactName}${contactJobTitle ? `, ${contactJobTitle}` : ""} — prénom du client à utiliser après « Bonjour » : ${contactFirstName}
- Poste ouvert : ${offer.offerTitle || "non précisé"}
${offer.offerContent ? `- Description de l'offre : ${offer.offerContent.substring(0, 800)}` : ""}
${linkedinSummary ? `- Profil LinkedIn : ${linkedinSummary}` : ""}
${companyHook ? `- Contexte de recrutement trouvé (à utiliser comme hook d'accroche) : ${companyHook}` : ""}

Pitch recruteur :
${pitch || `${recruiterName} — cabinet de recrutement spécialisé profils Sales.`}

Canal : ${longChannelInstructions}

Structure OBLIGATOIRE — reproduis EXACTEMENT ce modèle, mot pour mot, en ne changeant que les éléments entre crochets :

Bonjour [prénom du contact],

Je suis tombé sur votre offre de [intitulé du poste simplifié — titre principal uniquement, sans hashtags ni parenthèses] chez [entreprise].

[SI hook contextuel disponible : utilise-le en 1 phrase. SINON : "Corrigez-moi si je me trompe, mais si vous cherchez encore, c'est peut-être parce que comme souvent les profils reçus sont "bons sur le papier", mais peu vraiment alignés avec le cycle de vente."]

De notre côté, on a pris le sujet à l'envers : on identifie à l'aide de notre moteur interne des profils déjà alignés avec votre cycle de vente, puis on valide avec eux leur intérêt avant même de vous les présenter.

J'ai commencé à jeter un œil de mon côté, il y a déjà quelques profils qui pourraient bien coller.

Je vous laisse regarder notre approche : ${channel === "email" ? '<a href="https://proxima-agents.com/">proxima-agents.com</a>' : "https://proxima-agents.com/"}

Si ça vous parle, je peux vous envoyer une première shortlist dans la journée.
[Prénom du recruteur — utiliser : ${recruiterFirstName}]

RÈGLES STRICTES :
- Ne modifier QUE : le prénom du contact (${contactFirstName}), le poste, l'entreprise, et la phrase d'accroche si hook disponible
- Aucune mention d'expérience, de secteur, d'entreprises similaires, de prix ou de conditions
- Aucune reformulation — les phrases sont FIGÉES mot pour mot
- Pas de tirets "---" dans le message généré
- Toujours commencer par "Bonjour [prénom],"${channel === "email" ? '\n- Conserver la balise <a href="https://proxima-agents.com/">proxima-agents.com</a> telle quelle dans le message' : ""}

Objectif : que le prospect se dise "Ce recruteur sait exactement qui je cherche et ça ne me coûte rien d'essayer."${extraInstructions ? `\n\nInstructions supplémentaires (prioritaires) :\n${extraInstructions}` : ""}`;

  try {
    const aiMessage = await chatComplete({
      systemPrompt,
      userPrompt: "Génère le message de prospection.",
      maxTokens: 700,
      temperature: 0.75,
    });

    const [updated] = await db
      .update(prospectContact)
      .set({ aiMessage, updatedAt: new Date() })
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
