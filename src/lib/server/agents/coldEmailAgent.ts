/**
 * Agent spécialisé cold email / WhatsApp B2B (recrutement).
 *
 * Deux rôles distincts en amont :
 *   - offerPropositionAgent → contraintes métier (Claude Haiku)
 *   - buildPersonalizationContext → signaux factuels (offre, LinkedIn, analyse offre)
 *
 * Cet agent ne suit aucun template : il reçoit les faits + un brief interne
 * et rédige un message unique, sobre, crédible.
 */
import { chatComplete } from "$lib/server/aiChat";
import { validateEmailMessage } from "$lib/server/personalization/validateMessage";
import type { PersonalizationContext } from "$lib/server/personalization/types";

export type ColdEmailChannel = "email" | "whatsapp";

export type GenerateColdEmailParams = {
  ctx: PersonalizationContext;
  channel: ColdEmailChannel;
  contactId: string;
  extraInstructions?: string;
};

export type ColdEmailResult = {
  message: string;
  warnings: string[];
  styleVariant: string;
};

const STYLE_VARIANTS = [
  "Accroche directe en une phrase — pas de formule d'introduction creuse.",
  "Ouvre par une observation factuelle sur l'offre ou le contexte entreprise.",
  "Ouvre par une question courte et concrète liée au recrutement en cours.",
  "Style télégraphique : phrases courtes, rythme rapide, zéro remplissage.",
  "Ton légèrement conversationnel — comme un mail qu'on envoie à un pair, pas à un prospect anonyme.",
  "Structure inversée : d'abord la proposition de valeur en une ligne, puis le contexte.",
];

const CLICHE_PATTERNS = [
  /j'espère que (?:vous|tu) allez bien/i,
  /je me permets de vous contacter/i,
  /leader du marché/i,
  /expertise unique/i,
  /solution innovante/i,
  /n'hésitez pas à/i,
];

function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

function pickStyleVariant(contactId: string): string {
  return STYLE_VARIANTS[hashSeed(contactId) % STYLE_VARIANTS.length]!;
}

function buildSystemPrompt(ctx: PersonalizationContext, channel: ColdEmailChannel): string {
  const channelLabel = channel === "email" ? "email froid" : "WhatsApp";
  const outputFormat =
    channel === "email"
      ? `Format de sortie :
Objet: (une ligne, naturelle — pas forcément "Re:")
(corps sur plusieurs lignes, 80–140 mots)
Pas de HTML. Pas de lien dans le corps.`
      : `Format de sortie :
Message WhatsApp sur plusieurs lignes, SANS "Objet:".
Tu peux inclure https://proxima-agents.com/ une seule fois si pertinent.`;

  return `Tu es un expert en ${channelLabel} B2B en français, avec 10 ans d'expérience en prospection recrutement.

Tu rédiges AU NOM DE : ${ctx.recruiterName}, spécialisé ${ctx.offerProposition.recruiterSpecialty} chez ${ctx.recruiterCompany}.

=== TON MÉTIER ===
- Écrire des messages qu'on lit en 15 secondes et auxquels on a envie de répondre.
- Chaque message est UNIQUE : structure, rythme, accroche, formulation du CTA varient à chaque fois.
- Tu ne suis AUCUN template. Tu n'utilises pas les mêmes tournures d'un mail à l'autre.
- Zéro jargon marketing. Zéro superlatif. Zéro "j'espère que vous allez bien".

=== RÈGLES FACTUELLES (non négociables) ===
- Utilise UNIQUEMENT les faits du payload. N'invente rien.
- Si un signal n'est pas fourni, ne le mentionne pas.
- Salutation : "Bonjour ${ctx.contactFirstName},"
- Signature : ${ctx.recruiterFirstName} (prénom seul, dernière ligne)
- Poste visé : ${ctx.offerTitleClean} — reste cohérent avec le métier (${ctx.offerProposition.roleFamily}), pas de vocabulaire commercial si le poste ne l'est pas.
- Termes interdits : ${ctx.offerProposition.termsToAvoid.length ? ctx.offerProposition.termsToAvoid.join(", ") : "aucun"}

=== CE QUE TU VENDS (le fond, pas la forme) ===
${ctx.offerProposition.writerBrief}

${outputFormat}

Réponds UNIQUEMENT avec le message final, rien d'autre.`;
}

function buildUserPrompt(
  ctx: PersonalizationContext,
  styleVariant: string,
  extraInstructions?: string,
): string {
  const signals = ctx.signals
    .slice(0, 3)
    .map((s) => `[${s.type}] ${s.text}`)
    .join("\n");

  const keywords = ctx.offerProposition.keywordsToUse.length
    ? ctx.offerProposition.keywordsToUse.join(", ")
    : "(aucun)";

  return `Rédige le message en t'inspirant de ces faits. Choisis librement quoi mettre en avant.

STYLE SUGGÉRÉ POUR CE MESSAGE (adapte, ne copie pas) :
${styleVariant}

--- DESTINATAIRE ---
Nom : ${ctx.contactFullName}
Rôle : ${ctx.contactJobTitle || "non précisé"}
Segment : ${ctx.segment}

--- OFFRE ---
Entreprise : ${ctx.companyName}
Poste : ${ctx.offerTitleClean}
${ctx.offerLocation ? `Localisation : ${ctx.offerLocation}` : ""}

Extrait offre :
${ctx.offerExcerpt || "(non disponible)"}

--- CONTEXTE CONTACT ---
${ctx.linkedinSummary || "(profil LinkedIn non enrichi)"}

--- CAMPAGNE ---
${ctx.pitch || "(aucun pitch défini)"}

--- SIGNAUX (0 à 2 max dans le message, uniquement si pertinents) ---
Types : contact_post > company_news > company_weak_signal (signaux faibles web = OK en accroche si factuels)
${signals || "(aucun signal — rester sur l'offre et le besoin métier)"}

--- VOCABULAIRE MÉTIER UTILE ---
${keywords}
${extraInstructions ? `\n--- INSTRUCTIONS SUPPLÉMENTAIRES ---\n${extraInstructions}` : ""}`;
}

function detectCliches(text: string): string[] {
  const found: string[] = [];
  for (const pattern of CLICHE_PATTERNS) {
    if (pattern.test(text)) found.push(`Formule cliché détectée : ${pattern.source}`);
  }
  return found;
}

export async function generateColdEmail(
  params: GenerateColdEmailParams,
): Promise<ColdEmailResult> {
  const { ctx, channel, contactId, extraInstructions } = params;
  const styleVariant = pickStyleVariant(contactId);

  const message = await chatComplete({
    systemPrompt: buildSystemPrompt(ctx, channel),
    userPrompt: buildUserPrompt(ctx, styleVariant, extraInstructions),
    maxTokens: 500,
    temperature: 0.78,
  });

  const warnings = [
    ...validateEmailMessage(message, ctx, channel),
    ...detectCliches(message),
  ];

  return { message, warnings, styleVariant };
}
