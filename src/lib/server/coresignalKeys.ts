import { db } from "$lib/server/db";
import { coresignalApiKey, user } from "$lib/server/db/schema";
import { eq, and, asc } from "drizzle-orm";

/**
 * Returns the least-recently-used active Coresignal API key for the user.
 * Falls back to user.coresignal_api_key if no multi-keys are configured.
 */
export async function getNextAvailableCoresignalApiKey(userId: string): Promise<string | null> {
  const keys = await db
    .select({ id: coresignalApiKey.id, apiKey: coresignalApiKey.apiKey })
    .from(coresignalApiKey)
    .where(and(eq(coresignalApiKey.userId, userId), eq(coresignalApiKey.isActive, true)))
    .orderBy(asc(coresignalApiKey.lastUsedAt), asc(coresignalApiKey.order))
    .limit(1);

  if (keys.length > 0) {
    await db
      .update(coresignalApiKey)
      .set({ lastUsedAt: new Date() })
      .where(eq(coresignalApiKey.id, keys[0].id));
    return keys[0].apiKey;
  }

  // Fallback to single key stored on user
  const [profile] = await db
    .select({ coresignalApiKey: user.coresignalApiKey })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return profile?.coresignalApiKey ?? null;
}

/**
 * Marks a specific API key as exhausted (inactive) after a 402 response.
 */
export async function markApiKeyAsExhausted(userId: string, apiKey: string): Promise<void> {
  await db
    .update(coresignalApiKey)
    .set({ isActive: false })
    .where(and(eq(coresignalApiKey.userId, userId), eq(coresignalApiKey.apiKey, apiKey)));
}

/**
 * Returns true if the error message indicates a credit/quota issue.
 */
export function isCreditError(message: string): boolean {
  return (
    message.includes("402") ||
    message.includes("insuffisants") ||
    message.includes("Payment Required") ||
    message.includes("429") ||
    message.includes("Too Many Requests")
  );
}
