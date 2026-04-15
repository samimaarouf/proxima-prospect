import { redirect } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { user } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import { getUnipileService } from "$lib/services/UnipileService";
import type { PageServerLoad, Actions } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) throw redirect(302, "/login");

  const [profile] = await db
    .select({
      unipileLinkedInAccountId: user.unipileLinkedInAccountId,
      unipileWhatsAppAccountId: user.unipileWhatsAppAccountId,
      unipileAccountId: user.unipileAccountId,
      coresignalApiKey: user.coresignalApiKey,
      fullenrichApiKey: user.fullenrichApiKey,
    })
    .from(user)
    .where(eq(user.id, locals.user.id))
    .limit(1);

  // Try to fetch account details from Unipile for display
  let linkedinAccount: { id: string; name?: string } | null = null;
  let whatsappAccount: { id: string; name?: string } | null = null;
  let emailAccount: { id: string; name?: string } | null = null;

  try {
    const unipile = getUnipileService();
    if (profile?.unipileLinkedInAccountId) {
      const acc = await unipile.getAccount(profile.unipileLinkedInAccountId).catch(() => null);
      if (acc) linkedinAccount = { id: acc.id, name: acc.name || acc.identifier };
    }
    if (profile?.unipileWhatsAppAccountId) {
      const acc = await unipile.getAccount(profile.unipileWhatsAppAccountId).catch(() => null);
      if (acc) whatsappAccount = { id: acc.id, name: acc.name || acc.identifier };
    }
    if (profile?.unipileAccountId) {
      const acc = await unipile.getAccount(profile.unipileAccountId).catch(() => null);
      if (acc) emailAccount = { id: acc.id, name: acc.name || acc.identifier };
    }
  } catch {
    // Unipile not available, show stored IDs only
    if (profile?.unipileLinkedInAccountId) linkedinAccount = { id: profile.unipileLinkedInAccountId };
    if (profile?.unipileWhatsAppAccountId) whatsappAccount = { id: profile.unipileWhatsAppAccountId };
    if (profile?.unipileAccountId) emailAccount = { id: profile.unipileAccountId };
  }

  return {
    linkedinAccount,
    whatsappAccount,
    emailAccount,
    coresignalApiKey: profile?.coresignalApiKey ?? null,
    fullenrichApiKey: profile?.fullenrichApiKey ?? null,
  };
};

export const actions: Actions = {
  saveApiKey: async ({ locals, request }) => {
    if (!locals.user) throw redirect(302, "/login");
    const formData = await request.formData();
    const key = (formData.get("key") as string | null)?.trim() || null;
    await db.update(user).set({ coresignalApiKey: key }).where(eq(user.id, locals.user.id));
    return { success: true };
  },

  saveFullenrichKey: async ({ locals, request }) => {
    if (!locals.user) throw redirect(302, "/login");
    const formData = await request.formData();
    const key = (formData.get("key") as string | null)?.trim() || null;
    await db.update(user).set({ fullenrichApiKey: key }).where(eq(user.id, locals.user.id));
    return { success: true };
  },

  disconnect: async ({ locals, request }) => {
    if (!locals.user) throw redirect(302, "/login");

    const formData = await request.formData();
    const type = formData.get("type") as string;

    const field =
      type === "LINKEDIN" ? "unipileLinkedInAccountId" :
      type === "WHATSAPP" ? "unipileWhatsAppAccountId" :
      "unipileAccountId";

    await db
      .update(user)
      .set({ [field]: null })
      .where(eq(user.id, locals.user.id));

    return { success: true };
  },
};
