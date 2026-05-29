import type { PersonalizationContext } from "./types";

export function scoreSignals(
  ctx: Omit<PersonalizationContext, "qualityScore">,
): number {
  let score = 40;

  if (ctx.contactFirstName && ctx.contactFirstName !== "Madame/Monsieur") {
    score += 10;
  }
  if (ctx.offerExcerpt.length > 80) score += 15;
  if (ctx.signals.some((s) => s.type === "company_news")) score += 10;
  if (ctx.signals.some((s) => s.type === "company_weak_signal")) score += 10;
  if (ctx.signals.some((s) => s.type === "contact_post")) score += 20;
  if (ctx.linkedinSummary.length > 50) score += 10;
  if (ctx.pitch.length > 20) score += 5;
  if (ctx.offerProposition.source === "agent") score += 5;

  return Math.min(score, 100);
}
