import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { prospectContact, prospectOffer, user, messageHistory } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import { UnipileService } from "$lib/services/UnipileService";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) {
    return json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const channel: "linkedin" | "whatsapp" | "email" = body.channel || "linkedin";
  const customMessage: string | undefined = body.message;
  const recipientOverride: string | undefined = body.recipient;

  const contacts = await db
    .select()
    .from(prospectContact)
    .where(eq(prospectContact.id, params.id))
    .limit(1);

  if (!contacts.length) {
    return json({ error: "Contact introuvable" }, { status: 404 });
  }

  const contact = contacts[0];
  const messageToSend = customMessage || contact.aiMessage;

  if (!messageToSend) {
    return json({ error: "Aucun message à envoyer. Générez d'abord un message IA." }, { status: 400 });
  }

  // Get user's Unipile account IDs
  const userProfile = await db
    .select({
      unipileLinkedInAccountId: user.unipileLinkedInAccountId,
      unipileWhatsAppAccountId: user.unipileWhatsAppAccountId,
      unipileAccountId: user.unipileAccountId,
    })
    .from(user)
    .where(eq(user.id, locals.user.id))
    .limit(1);

  const profile = userProfile[0];
  if (!profile) {
    return json({ error: "Profil utilisateur introuvable" }, { status: 404 });
  }

  // Fetch offer info for history context
  const offerRows = await db
    .select({ offerTitle: prospectOffer.offerTitle, companyName: prospectOffer.companyName })
    .from(prospectOffer)
    .where(eq(prospectOffer.id, contact.offerId))
    .limit(1);
  const offer = offerRows[0];

  const unipile = new UnipileService();
  let resolvedRecipient: string | undefined = recipientOverride;

  try {
    if (channel === "linkedin") {
      const accountId = profile.unipileLinkedInAccountId;
      if (!accountId) {
        return json({ error: "Compte LinkedIn non connecté. Configurez-le dans proxima-v3." }, { status: 400 });
      }
      if (!contact.linkedinUrl) {
        return json({ error: "Pas d'URL LinkedIn pour ce contact" }, { status: 400 });
      }

      // Smart send: check if already connected
      const linkedinUsername = extractLinkedInUsername(contact.linkedinUrl);
      if (!linkedinUsername) {
        return json({ error: "URL LinkedIn invalide" }, { status: 400 });
      }

      const profileResult = await unipile.getLinkedInUserProfile(accountId, linkedinUsername);

      if (!profileResult.success) {
        return json({ error: profileResult.error || "Impossible de résoudre le profil LinkedIn" }, { status: 500 });
      }

      if (profileResult.networkDistance === "FIRST_DEGREE") {
        // Already connected: send direct message
        const result = await unipile.startNewChat({
          accountId,
          attendeeIds: [profileResult.providerId!],
          text: messageToSend,
        });
        if (!result.success) {
          return json({ error: result.error || "Erreur lors de l'envoi du message LinkedIn" }, { status: 500 });
        }
      } else {
        // Not connected: send connection request with note
        const truncatedMessage = messageToSend.length > 300 ? messageToSend.substring(0, 297) + "..." : messageToSend;
        const result = await unipile.sendLinkedInConnectionRequest(accountId, contact.linkedinUrl, truncatedMessage);
        if (!result.success) {
          let userFacingError = result.error || "Erreur lors de l'envoi de l'invitation LinkedIn";
          if (result.error?.includes("already_invited_recently")) {
            userFacingError = "Une invitation a déjà été envoyée récemment à ce contact.";
          } else if (result.error?.includes("401")) {
            userFacingError = "Compte LinkedIn déconnecté. Reconnectez-le dans proxima-v3.";
          }
          return json({ error: userFacingError }, { status: 500 });
        }
      }
    } else if (channel === "whatsapp") {
      const accountId = profile.unipileWhatsAppAccountId;
      if (!accountId) {
        return json({ error: "Compte WhatsApp non connecté. Configurez-le dans proxima-v3." }, { status: 400 });
      }
      const phone = resolvedRecipient || contact.phone1 || contact.phone2;
      if (!phone) {
        return json({ error: "Pas de numéro de téléphone pour ce contact" }, { status: 400 });
      }
      resolvedRecipient = phone;

      // Format phone number for WhatsApp
      const formattedPhone = formatPhoneForWhatsApp(phone);
      const result = await unipile.startNewChat({
        accountId,
        attendeeIds: [formattedPhone],
        text: messageToSend,
      });
      if (!result.success) {
        return json({ error: result.error || "Erreur lors de l'envoi WhatsApp" }, { status: 500 });
      }
    } else if (channel === "email") {
      const accountId = profile.unipileAccountId;
      if (!accountId) {
        return json({ error: "Compte email non connecté. Configurez-le dans proxima-v3." }, { status: 400 });
      }
      const emailTo = resolvedRecipient || contact.email;
      if (!emailTo) {
        return json({ error: "Pas d'email pour ce contact" }, { status: 400 });
      }
      resolvedRecipient = emailTo;

      // Parse subject from message if present (format: "Objet: ...")
      let subject = `Proposition de partenariat — ${contact.fullName || ""}`.trim();
      let emailBody = messageToSend;
      const subjectMatch = messageToSend.match(/^Objet\s*:\s*(.+)$/im);
      if (subjectMatch) {
        subject = subjectMatch[1].trim();
        emailBody = messageToSend.replace(/^Objet\s*:\s*.+\n?/im, "").trim();
      }

      const result = await unipile.sendEmail({
        accountId,
        to: [{ identifier: emailTo, display_name: contact.fullName || undefined }],
        subject,
        body: emailBody,
      });
      if (!result.success) {
        return json({ error: result.error || "Erreur lors de l'envoi de l'email" }, { status: 500 });
      }
    }

    // Save to message history
    await db.insert(messageHistory).values({
      userId: locals.user.id,
      linkedinUrl: contact.linkedinUrl || null,
      contactName: contact.fullName || null,
      offerTitle: offer?.offerTitle || null,
      companyName: offer?.companyName || null,
      channel,
      recipient: resolvedRecipient || null,
      message: messageToSend,
    });

    // Update contact status to track which channel was used
    const [updated] = await db
      .update(prospectContact)
      .set({
        contactStatus: `contacted_${channel}`,
        updatedAt: new Date(),
      })
      .where(eq(prospectContact.id, params.id))
      .returning();

    return json(updated);
  } catch (err) {
    console.error("Send error:", err);
    return json(
      { error: err instanceof Error ? err.message : "Erreur lors de l'envoi" },
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

function formatPhoneForWhatsApp(phone: string): string {
  // Remove spaces, dashes, parentheses
  let cleaned = phone.replace(/[\s\-().]/g, "");
  // If starts with 0, replace with +33 (France)
  if (cleaned.startsWith("0") && !cleaned.startsWith("00")) {
    cleaned = "+33" + cleaned.substring(1);
  }
  return cleaned;
}
