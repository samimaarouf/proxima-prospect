import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { prospectContact } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "./$types";

const STRING_FIELDS = [
  "contactStatus",
  "aiMessage",
  "aiMessageLinkedin",
  "notes",
  "nextStep",
  "lastAction",
  "email",
  "phone1",
  "phone2",
  "linkedinUrl",
] as const;

const DATE_FIELDS = [
  "emailSentAt",
  "linkedinSentAt",
  "whatsappSentAt",
  "calledAt",
  "nextStepAt",
] as const;

function parseDate(value: unknown): Date | null | undefined {
  if (value === null || value === "") return null;
  if (value === undefined) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }
  return undefined;
}

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  if (!locals.user) {
    return json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  for (const key of STRING_FIELDS) {
    if (key in body) {
      updateData[key] = body[key];
    }
  }

  for (const key of DATE_FIELDS) {
    if (key in body) {
      const parsed = parseDate(body[key]);
      if (parsed !== undefined) {
        updateData[key] = parsed;
      }
    }
  }

  const [updated] = await db
    .update(prospectContact)
    .set(updateData)
    .where(eq(prospectContact.id, params.id))
    .returning();

  return json(updated);
};
