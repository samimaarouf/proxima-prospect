import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { prospectContact } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "./$types";

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) {
    return json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  const allowed = ["contactStatus", "aiMessage", "notes", "nextStep", "lastAction", "email", "phone1", "phone2", "linkedinUrl"];
  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  for (const key of allowed) {
    if (key in body) {
      updateData[key] = body[key];
    }
  }

  const [updated] = await db
    .update(prospectContact)
    .set(updateData)
    .where(eq(prospectContact.id, params.id))
    .returning();

  return json(updated);
};
