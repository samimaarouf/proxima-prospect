import { json, error, redirect } from "@sveltejs/kit";
import { getUnipileService } from "$lib/services/UnipileService";
import type { RequestHandler } from "./$types";

const PROVIDER_MAP: Record<string, ("GOOGLE" | "MICROSOFT" | "IMAP" | "LINKEDIN" | "WHATSAPP")[]> = {
  LINKEDIN: ["LINKEDIN"],
  WHATSAPP: ["WHATSAPP"],
  EMAIL: ["GOOGLE", "MICROSOFT", "IMAP"],
};

export const POST: RequestHandler = async ({ locals, request, url }) => {
  if (!locals.user) throw redirect(302, "/login");

  const body = await request.json();
  const type = (body.type as string)?.toUpperCase();

  const providers = PROVIDER_MAP[type];
  if (!providers) throw error(400, "Type invalide. Valeurs acceptées : LINKEDIN, WHATSAPP, EMAIL");

  const origin = url.origin;
  const successRedirectUrl = `${origin}/settings/connected?type=${type}`;
  const failureRedirectUrl = `${origin}/settings?error=connection_failed`;

  const unipile = getUnipileService();

  try {
    const { url: authUrl } = await unipile.generateHostedAuthLink({
      providers,
      successRedirectUrl,
      failureRedirectUrl,
      name: locals.user.id,
      expiresOn: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes
    });

    return json({ url: authUrl });
  } catch (err) {
    console.error("[connect-unipile] Error:", err);
    throw error(500, err instanceof Error ? err.message : "Erreur Unipile");
  }
};
