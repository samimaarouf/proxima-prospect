import type { PersonalizationContext } from "./types";

export function validateEmailMessage(
  raw: string,
  ctx: PersonalizationContext,
  channel: "email" | "whatsapp",
): string[] {
  const warnings: string[] = [];
  const lower = raw.toLowerCase();
  const wordCount = raw.split(/\s+/).filter(Boolean).length;

  if (channel === "email" && !/^Objet\s*:/im.test(raw)) {
    warnings.push("Objet manquant");
  }
  if (wordCount > 180) warnings.push("Message trop long");
  if (
    lower.includes(ctx.recruiterFirstName.toLowerCase()) &&
    !lower.includes(`bonjour ${ctx.contactFirstName.toLowerCase()}`)
  ) {
    warnings.push("Possible confusion recruteur/destinataire");
  }
  if (/leader du marché|expertise unique|solution innovante/i.test(raw)) {
    warnings.push("Formulations marketing détectées");
  }
  if (
    !ctx.signals.some(
      (s) => s.type === "company_news" || s.type === "company_weak_signal",
    ) &&
    /levée de fonds|série [abc]/i.test(raw)
  ) {
    warnings.push("Mention financière sans signal sourcé");
  }
  if (
    !ctx.signals.some((s) => s.type === "contact_post") &&
    /j'ai vu votre post|votre publication|votre post linkedin/i.test(raw)
  ) {
    warnings.push("Mention d'un post LinkedIn sans signal sourcé");
  }

  for (const term of ctx.offerProposition.termsToAvoid) {
    if (term && lower.includes(term.toLowerCase())) {
      warnings.push(`Terme hors-sujet détecté : "${term}"`);
    }
  }

  if (
    ctx.offerProposition.roleFamily !== "sales" &&
    /cycle de vente|quota commercial|profils sales|profils commerciaux/i.test(raw)
  ) {
    warnings.push("Vocabulaire commercial sur un poste non-commercial");
  }

  return warnings;
}
