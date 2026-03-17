import { json } from "@sveltejs/kit";
import { d as db, p as prospectContact, u as user } from "../../../../../../chunks/index2.js";
import { eq } from "drizzle-orm";
import { U as UnipileService } from "../../../../../../chunks/UnipileService.js";
import OpenAI from "openai";
import { b as private_env } from "../../../../../../chunks/shared-server.js";
const POST = async ({ locals, params }) => {
  if (!locals.user) {
    return json({ error: "Non authentifié" }, { status: 401 });
  }
  const contacts = await db.select().from(prospectContact).where(eq(prospectContact.id, params.id)).limit(1);
  if (!contacts.length) {
    return json({ error: "Contact introuvable" }, { status: 404 });
  }
  const contact = contacts[0];
  if (!contact.linkedinUrl) {
    return json({ error: "Pas d'URL LinkedIn pour ce contact" }, { status: 400 });
  }
  const userProfile = await db.select({ unipileLinkedInAccountId: user.unipileLinkedInAccountId }).from(user).where(eq(user.id, locals.user.id)).limit(1);
  const linkedInAccountId = userProfile[0]?.unipileLinkedInAccountId;
  if (!linkedInAccountId) {
    return json({ error: "Compte LinkedIn non connecté. Configurez-le dans proxima-v3." }, { status: 400 });
  }
  try {
    const unipile = new UnipileService();
    const linkedinUsername = extractLinkedInUsername(contact.linkedinUrl);
    if (!linkedinUsername) {
      return json({ error: "URL LinkedIn invalide" }, { status: 400 });
    }
    const profileResult = await unipile.getLinkedInUserProfile(linkedInAccountId, linkedinUsername);
    if (!profileResult.success || !profileResult.profile) {
      return json({ error: profileResult.error || "Impossible de récupérer le profil LinkedIn" }, { status: 500 });
    }
    const profile = profileResult.profile;
    const firstName = profile.first_name || "";
    const lastName = profile.last_name || "";
    const fullName = `${firstName} ${lastName}`.trim() || null;
    const jobTitle = profile.headline || profile.current_title || null;
    const openai = new OpenAI({ apiKey: private_env.OPENAI_API_KEY });
    const experiences = extractExperiences(profile);
    const skills = extractSkills(profile);
    const headline = profile.headline || "";
    const summaryPrompt = `Tu es un assistant de recrutement. Analyse ce profil LinkedIn et rédige un résumé de 2-3 phrases concises en français, en mettant en avant :
1. Le titre/rôle actuel et l'entreprise actuelle
2. L'expertise principale et les compétences clés
3. Le parcours pertinent

Données du profil :
Nom : ${fullName}
Titre : ${headline}
Expériences récentes : ${experiences.slice(0, 3).map((e) => `${e.title} chez ${e.company} (${e.duration || ""})`).join(", ")}
Compétences : ${skills.slice(0, 8).join(", ")}

Réponds uniquement avec le résumé, sans introduction ni conclusion.`;
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: summaryPrompt }],
      max_tokens: 200,
      temperature: 0.7
    });
    const linkedinSummary = completion.choices[0]?.message?.content?.trim() || null;
    const [updated] = await db.update(prospectContact).set({
      fullName: fullName || contact.fullName,
      jobTitle: jobTitle || contact.jobTitle,
      linkedinData: profile,
      linkedinSummary,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(prospectContact.id, params.id)).returning();
    return json(updated);
  } catch (err) {
    console.error("LinkedIn enrichment error:", err);
    return json(
      { error: err instanceof Error ? err.message : "Erreur lors de l'enrichissement" },
      { status: 500 }
    );
  }
};
function extractLinkedInUsername(url) {
  try {
    const normalized = url.startsWith("http") ? url : `https://${url}`;
    const parsed = new URL(normalized);
    const match = parsed.pathname.match(/\/in\/([^\/\?]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
function extractExperiences(profile) {
  const experiences = profile.experience || profile.experiences || [];
  return experiences.slice(0, 5).map((exp) => {
    const e = exp;
    return {
      title: e.title || e.position || "",
      company: e.company || e.company_name || "",
      duration: e.duration || ""
    };
  });
}
function extractSkills(profile) {
  const skills = profile.skills || [];
  return skills.slice(0, 10).map((s) => {
    const skill = s;
    return skill.name || (typeof s === "string" ? s : "");
  }).filter(Boolean);
}
export {
  POST
};
