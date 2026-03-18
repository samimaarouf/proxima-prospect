import { redirect } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { user } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import { getUnipileService } from "$lib/services/UnipileService";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) throw redirect(302, "/login");

  const type = url.searchParams.get("type")?.toUpperCase();
  // Unipile may pass the account_id directly in the redirect URL
  const accountIdFromUrl = url.searchParams.get("account_id");

  if (!type) throw redirect(302, "/settings");

  let accountId: string | null = accountIdFromUrl;

  if (!accountId) {
    // Fall back to finding the most recently connected account by type
    try {
      const unipile = getUnipileService();
      // For EMAIL, try GOOGLE / MICROSOFT / IMAP types
      const typesToSearch = type === "EMAIL" ? ["GOOGLE", "MICROSOFT", "IMAP"] : [type];
      for (const t of typesToSearch) {
        const acc = await unipile.findRecentAccountByType(t);
        if (acc) {
          accountId = acc.id;
          break;
        }
      }
    } catch {
      throw redirect(302, "/settings?error=lookup_failed");
    }
  }

  if (!accountId) throw redirect(302, "/settings?error=no_account_found");

  // Save to the correct field on the user
  const field =
    type === "LINKEDIN" ? "unipileLinkedInAccountId" :
    type === "WHATSAPP" ? "unipileWhatsAppAccountId" :
    "unipileAccountId";

  await db
    .update(user)
    .set({ [field]: accountId })
    .where(eq(user.id, locals.user.id));

  throw redirect(302, "/settings?connected=" + type.toLowerCase());
};
