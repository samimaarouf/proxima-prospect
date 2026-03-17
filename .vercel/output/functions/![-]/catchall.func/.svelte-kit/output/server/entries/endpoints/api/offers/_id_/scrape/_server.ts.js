import { json } from "@sveltejs/kit";
import { d as db, a as prospectOffer, b as prospectList } from "../../../../../../chunks/index2.js";
import { eq } from "drizzle-orm";
import OpenAI from "openai";
import { b as private_env } from "../../../../../../chunks/shared-server.js";
const POST = async ({ locals, params }) => {
  if (!locals.user) {
    return json({ error: "Non authentifié" }, { status: 401 });
  }
  const offers = await db.select().from(prospectOffer).where(eq(prospectOffer.id, params.id)).limit(1);
  if (!offers.length) {
    return json({ error: "Offre introuvable" }, { status: 404 });
  }
  const offer = offers[0];
  const lists = await db.select({ userId: prospectList.userId }).from(prospectList).where(eq(prospectList.id, offer.listId)).limit(1);
  if (!lists.length || lists[0].userId !== locals.user.id) {
    return json({ error: "Accès refusé" }, { status: 403 });
  }
  if (!offer.offerUrl) {
    return json({ error: "Aucune URL pour cette offre" }, { status: 400 });
  }
  let pageText = "";
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1e4);
    const response = await fetch(offer.offerUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8"
      }
    });
    clearTimeout(timeout);
    if (!response.ok) {
      return json(
        { error: `La page a retourné une erreur ${response.status}` },
        { status: 422 }
      );
    }
    const html = await response.text();
    pageText = stripHtml(html);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur réseau";
    return json({ error: `Impossible de récupérer la page : ${msg}` }, { status: 422 });
  }
  if (!pageText.trim()) {
    return json({ error: "La page ne contient pas de texte exploitable" }, { status: 422 });
  }
  const truncated = pageText.slice(0, 4e3);
  try {
    const openai = new OpenAI({ apiKey: private_env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Tu es un assistant qui extrait des informations structurées à partir du contenu d'une page d'offre d'emploi.
Réponds UNIQUEMENT avec un objet JSON valide contenant les champs suivants :
- "title": l'intitulé exact du poste (string, ou null si introuvable)
- "location": la localisation du poste, ville et/ou pays (string, ou null si introuvable)

Ne fournis aucune explication, uniquement le JSON brut.`
        },
        {
          role: "user",
          content: `Voici le contenu de la page d'offre d'emploi :

${truncated}`
        }
      ],
      max_tokens: 150,
      temperature: 0,
      response_format: { type: "json_object" }
    });
    const raw = completion.choices[0]?.message?.content?.trim() || "{}";
    let extracted = {};
    try {
      extracted = JSON.parse(raw);
    } catch {
      return json({ error: "Impossible de parser la réponse de l'IA" }, { status: 500 });
    }
    const offerTitle = extracted.title?.trim() || null;
    const offerLocation = extracted.location?.trim() || null;
    if (!offerTitle && !offerLocation) {
      return json({ error: "Titre et localisation introuvables dans la page" }, { status: 422 });
    }
    const [updated] = await db.update(prospectOffer).set({
      ...offerTitle ? { offerTitle } : {},
      ...offerLocation ? { offerLocation } : {}
    }).where(eq(prospectOffer.id, params.id)).returning();
    return json(updated);
  } catch (err) {
    console.error("Scrape/extract error:", err);
    return json(
      { error: err instanceof Error ? err.message : "Erreur lors de l'extraction IA" },
      { status: 500 }
    );
  }
};
function stripHtml(html) {
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  const jsonLdMatches = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
  const jsonLdText = jsonLdMatches ? jsonLdMatches.map((m) => {
    const inner = m.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "");
    try {
      const obj = JSON.parse(inner);
      const parts = [];
      if (obj.title) parts.push(`Titre: ${obj.title}`);
      if (obj.jobTitle) parts.push(`Poste: ${obj.jobTitle}`);
      if (obj.jobLocation?.address?.addressLocality)
        parts.push(`Ville: ${obj.jobLocation.address.addressLocality}`);
      if (obj.jobLocation?.address?.addressCountry)
        parts.push(`Pays: ${obj.jobLocation.address.addressCountry}`);
      if (obj.description) parts.push(obj.description.slice(0, 500));
      return parts.join("\n");
    } catch {
      return inner.slice(0, 300);
    }
  }).join("\n") : "";
  text = text.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<\/div>/gi, "\n").replace(/<\/h[1-6]>/gi, "\n").replace(/<\/li>/gi, "\n");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&eacute;/g, "é").replace(/&egrave;/g, "è").replace(/&agrave;/g, "à").replace(/&ecirc;/g, "ê").replace(/&uuml;/g, "ü").replace(/&#x27;/g, "'").replace(/&#[0-9]+;/g, " ");
  text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return jsonLdText ? `${jsonLdText}

${text}` : text;
}
export {
  POST
};
