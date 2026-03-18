import { json, redirect } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { messageHistory } from "$lib/server/db/schema";
import { and, eq, inArray, desc } from "drizzle-orm";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) throw redirect(302, "/login");

  const linkedinUrlsParam = url.searchParams.get("linkedinUrls");
  if (!linkedinUrlsParam) return json([]);

  const linkedinUrls = linkedinUrlsParam
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);

  if (!linkedinUrls.length) return json([]);

  const rows = await db
    .select()
    .from(messageHistory)
    .where(
      and(
        eq(messageHistory.userId, locals.user.id),
        inArray(messageHistory.linkedinUrl, linkedinUrls)
      )
    )
    .orderBy(desc(messageHistory.sentAt));

  return json(rows);
};
