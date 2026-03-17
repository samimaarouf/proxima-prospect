import { redirect } from "@sveltejs/kit";
import { d as db, b as prospectList } from "../../chunks/index2.js";
import { eq, desc } from "drizzle-orm";
const load = async ({ locals }) => {
  if (!locals.user) {
    throw redirect(302, "/login");
  }
  const lists = await db.select().from(prospectList).where(eq(prospectList.userId, locals.user.id)).orderBy(desc(prospectList.createdAt));
  return { lists };
};
export {
  load
};
