import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { coresignalApiKey } from "$lib/server/db/schema";
import { eq, and, asc } from "drizzle-orm";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) return json({ error: "Non authentifié" }, { status: 401 });

  const keys = await db
    .select({
      id: coresignalApiKey.id,
      label: coresignalApiKey.label,
      apiKey: coresignalApiKey.apiKey,
      isActive: coresignalApiKey.isActive,
      lastUsedAt: coresignalApiKey.lastUsedAt,
      order: coresignalApiKey.order,
      createdAt: coresignalApiKey.createdAt,
    })
    .from(coresignalApiKey)
    .where(eq(coresignalApiKey.userId, locals.user.id))
    .orderBy(asc(coresignalApiKey.order), asc(coresignalApiKey.createdAt));

  // Mask API key for display (show only last 6 chars)
  return json(keys.map((k) => ({
    ...k,
    apiKeyMasked: "••••••••" + k.apiKey.slice(-6),
  })));
};

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) return json({ error: "Non authentifié" }, { status: 401 });

  const body = await request.json();
  const apiKey = (body.apiKey as string | undefined)?.trim();
  const label = (body.label as string | undefined)?.trim() || null;

  if (!apiKey) return json({ error: "Clé API manquante" }, { status: 400 });

  const existing = await db
    .select({ id: coresignalApiKey.id })
    .from(coresignalApiKey)
    .where(and(eq(coresignalApiKey.userId, locals.user.id), eq(coresignalApiKey.apiKey, apiKey)))
    .limit(1);

  if (existing.length > 0) {
    return json({ error: "Cette clé est déjà enregistrée" }, { status: 409 });
  }

  // Determine order (append at end)
  const allKeys = await db
    .select({ order: coresignalApiKey.order })
    .from(coresignalApiKey)
    .where(eq(coresignalApiKey.userId, locals.user.id));
  const maxOrder = allKeys.reduce((max, k) => Math.max(max, k.order), -1);

  const [inserted] = await db
    .insert(coresignalApiKey)
    .values({ userId: locals.user.id, apiKey, label, order: maxOrder + 1 })
    .returning();

  return json({ ...inserted, apiKeyMasked: "••••••••" + inserted.apiKey.slice(-6) });
};

export const DELETE: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) return json({ error: "Non authentifié" }, { status: 401 });

  const body = await request.json();
  const id = body.id as string | undefined;
  if (!id) return json({ error: "ID manquant" }, { status: 400 });

  await db
    .delete(coresignalApiKey)
    .where(and(eq(coresignalApiKey.id, id), eq(coresignalApiKey.userId, locals.user.id)));

  return json({ success: true });
};

export const PATCH: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) return json({ error: "Non authentifié" }, { status: 401 });

  const body = await request.json();
  const id = body.id as string | undefined;
  if (!id) return json({ error: "ID manquant" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive);
  if (body.label !== undefined) updates.label = body.label || null;

  const [updated] = await db
    .update(coresignalApiKey)
    .set(updates)
    .where(and(eq(coresignalApiKey.id, id), eq(coresignalApiKey.userId, locals.user.id)))
    .returning();

  return json({ ...updated, apiKeyMasked: "••••••••" + updated.apiKey.slice(-6) });
};
