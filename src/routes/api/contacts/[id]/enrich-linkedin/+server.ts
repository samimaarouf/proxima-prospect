import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { prospectContact, prospectOffer, prospectList, user } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import { UnipileService } from "$lib/services/UnipileService";
import OpenAI from "openai";
import { env } from "$env/dynamic/private";
import { nameFromLinkedInSlug, looksLikeJobTitleNotName } from "$lib/linkedinUrl";
import { resolveLinkedInNameViaWebSearch } from "$lib/server/resolveLinkedInName";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) {
    return json({ error: "Non authentifié" }, { status: 401 });
  }

  const contacts = await db
    .select()
    .from(prospectContact)
    .where(eq(prospectContact.id, params.id))
    .limit(1);

  if (!contacts.length) {
    return json({ error: "Contact introuvable" }, { status: 404 });
  }

  const contact = contacts[0];

  if (!contact.linkedinUrl) {
    return json({ error: "Pas d'URL LinkedIn pour ce contact" }, { status: 400 });
  }

  // Fetch the parent offer so we can feed company/offer context to fallbacks.
  const [offerRow] = await db
    .select({ companyName: prospectOffer.companyName, offerTitle: prospectOffer.offerTitle })
    .from(prospectOffer)
    .where(eq(prospectOffer.id, contact.offerId))
    .limit(1);

  // Get user's LinkedIn account ID
  const userProfile = await db
    .select({ unipileLinkedInAccountId: user.unipileLinkedInAccountId })
    .from(user)
    .where(eq(user.id, locals.user.id))
    .limit(1);

  const linkedInAccountId = userProfile[0]?.unipileLinkedInAccountId;
  if (!linkedInAccountId) {
    return json({ error: "Compte LinkedIn non connecté. Configurez-le dans proxima-v3." }, { status: 400 });
  }

  try {
    const unipile = new UnipileService();

    // Extract LinkedIn username from URL
    const linkedinUsername = extractLinkedInUsername(contact.linkedinUrl);
    if (!linkedinUsername) {
      return json({ error: "URL LinkedIn invalide" }, { status: 400 });
    }

    // Fetch LinkedIn profile
    const profileResult = await unipile.getLinkedInUserProfile(linkedInAccountId, linkedinUsername);

    if (!profileResult.success || !profileResult.profile) {
      return json({ error: profileResult.error || "Impossible de récupérer le profil LinkedIn" }, { status: 500 });
    }

    const profile = profileResult.profile as Record<string, unknown>;

    // Extract key fields from the profile
    const firstName = (profile.first_name as string) || "";
    const lastName = (profile.last_name as string) || "";
    const rawFullName = `${firstName} ${lastName}`.trim() || null;
    const jobTitle = (profile.headline as string) || (profile.current_title as string) || null;

    // Guard against Unipile / LinkedIn returning the current job title as the
    // "name" (happens for out-of-network profiles, restricted accounts, etc.).
    // Cascade of fallbacks, from cheapest to most expensive:
    //   1. Unipile first_name + last_name (what we just computed)
    //   2. Name derived from the LinkedIn slug (free, but loses quality when
    //      the slug is a single token or suffixed with a random hash).
    //   3. Web search via OpenAI using the company/offer context (paid).
    const slugDerivedName = nameFromLinkedInSlug(contact.linkedinUrl);
    const rawLooksBad = looksLikeJobTitleNotName(rawFullName, jobTitle);

    let fullName: string | null = rawFullName;
    if (rawLooksBad && slugDerivedName) {
      fullName = slugDerivedName;
    }

    // If even the slug-derived name looks weak (one-word only, or is itself a
    // generic role token), try a web search with the offer context.
    const slugIsWeak =
      !slugDerivedName ||
      slugDerivedName.trim().split(/\s+/).length < 2 ||
      looksLikeJobTitleNotName(slugDerivedName, jobTitle);

    if (rawLooksBad && slugIsWeak) {
      const resolved = await resolveLinkedInNameViaWebSearch({
        linkedinUrl: contact.linkedinUrl,
        companyName: offerRow?.companyName ?? null,
        jobTitle: jobTitle ?? offerRow?.offerTitle ?? null,
        hint: slugDerivedName,
      });
      if (resolved?.fullName) {
        fullName = resolved.fullName;
      }
    }

    // Same guard for the value already stored on the contact: if it looks like
    // a job title (legacy data polluted before this guard existed), override it.
    const existingLooksBad = looksLikeJobTitleNotName(contact.fullName, jobTitle);

    // Build AI summary
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

    const experiences = extractExperiences(profile);
    const skills = extractSkills(profile);
    const headline = (profile.headline as string) || "";

    const summaryPrompt = `Tu es un assistant de recrutement. Analyse ce profil LinkedIn et rédige un résumé de 2-3 phrases concises en français, en mettant en avant :
1. Le titre/rôle actuel et l'entreprise actuelle
2. L'expertise principale et les compétences clés
3. Le parcours pertinent

Données du profil :
Nom : ${fullName}
Titre : ${headline}
Expériences récentes : ${experiences.slice(0, 3).map(e => `${e.title} chez ${e.company} (${e.duration || ""})`).join(", ")}
Compétences : ${skills.slice(0, 8).join(", ")}

Réponds uniquement avec le résumé, sans introduction ni conclusion.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: summaryPrompt }],
      max_tokens: 200,
      temperature: 0.7,
    });

    const linkedinSummary = completion.choices[0]?.message?.content?.trim() || null;

    // Update the contact in DB.
    // - If Unipile gave us something usable, take it.
    // - Otherwise keep whatever was already on the contact, UNLESS that value
    //   itself looks like a polluted job title, in which case we prefer the
    //   slug-derived name as a last resort.
    const finalFullName =
      fullName ??
      (existingLooksBad ? slugDerivedName ?? contact.fullName : contact.fullName);

    const [updated] = await db
      .update(prospectContact)
      .set({
        fullName: finalFullName,
        jobTitle: jobTitle || contact.jobTitle,
        linkedinData: profile as Record<string, unknown>,
        linkedinSummary,
        updatedAt: new Date(),
      })
      .where(eq(prospectContact.id, params.id))
      .returning();

    return json(updated);
  } catch (err) {
    console.error("LinkedIn enrichment error:", err);
    return json(
      { error: err instanceof Error ? err.message : "Erreur lors de l'enrichissement" },
      { status: 500 }
    );
  }
};

function extractLinkedInUsername(url: string): string | null {
  try {
    const normalized = url.startsWith("http") ? url : `https://${url}`;
    const parsed = new URL(normalized);
    const match = parsed.pathname.match(/\/in\/([^\/\?]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function extractExperiences(profile: Record<string, unknown>): { title: string; company: string; duration: string }[] {
  const experiences = (profile.experience as unknown[]) || (profile.experiences as unknown[]) || [];
  return experiences.slice(0, 5).map((exp) => {
    const e = exp as Record<string, unknown>;
    return {
      title: (e.title as string) || (e.position as string) || "",
      company: (e.company as string) || (e.company_name as string) || "",
      duration: (e.duration as string) || "",
    };
  });
}

function extractSkills(profile: Record<string, unknown>): string[] {
  const skills = (profile.skills as unknown[]) || [];
  return skills
    .slice(0, 10)
    .map((s) => {
      const skill = s as Record<string, unknown>;
      return (skill.name as string) || (typeof s === "string" ? s : "");
    })
    .filter(Boolean);
}
