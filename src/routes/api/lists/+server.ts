import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { prospectList } from "$lib/server/db/schema";
import { eq, desc } from "drizzle-orm";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: "Non authentifié" }, { status: 401 });
  }

  const lists = await db
    .select()
    .from(prospectList)
    .where(eq(prospectList.userId, locals.user.id))
    .orderBy(desc(prospectList.createdAt));

  return json(lists);
};

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) {
    return json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json();
  const { name, pitch } = body;

  if (!name?.trim()) {
    return json({ error: "Le nom est requis" }, { status: 400 });
  }

  const [newList] = await db
    .insert(prospectList)
    .values({
      userId: locals.user.id,
      name: name.trim(),
      pitch: pitch?.trim() || null,
    })
    .returning();

  return json(newList, { status: 201 });
};
