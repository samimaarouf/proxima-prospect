import { redirect } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { prospectList } from "$lib/server/db/schema";
import { eq, desc } from "drizzle-orm";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    throw redirect(302, "/login");
  }

  const lists = await db
    .select()
    .from(prospectList)
    .where(eq(prospectList.userId, locals.user.id))
    .orderBy(desc(prospectList.createdAt));

  return { lists };
};
