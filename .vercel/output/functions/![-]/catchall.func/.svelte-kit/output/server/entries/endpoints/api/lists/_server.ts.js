import { json } from "@sveltejs/kit";
import { d as db, b as prospectList } from "../../../../chunks/index2.js";
import { eq, desc } from "drizzle-orm";
const GET = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: "Non authentifié" }, { status: 401 });
  }
  const lists = await db.select().from(prospectList).where(eq(prospectList.userId, locals.user.id)).orderBy(desc(prospectList.createdAt));
  return json(lists);
};
const POST = async ({ locals, request }) => {
  if (!locals.user) {
    return json({ error: "Non authentifié" }, { status: 401 });
  }
  const body = await request.json();
  const { name, pitch } = body;
  if (!name?.trim()) {
    return json({ error: "Le nom est requis" }, { status: 400 });
  }
  const [newList] = await db.insert(prospectList).values({
    userId: locals.user.id,
    name: name.trim(),
    pitch: pitch?.trim() || null
  }).returning();
  return json(newList, { status: 201 });
};
export {
  GET,
  POST
};
