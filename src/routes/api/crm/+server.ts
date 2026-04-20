import { json, redirect } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { prospectContact, prospectOffer, prospectList } from "$lib/server/db/schema";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { RequestHandler } from "./$types";

/**
 * GET /api/crm
 *
 * Returns all contacts of the current user that have been contacted by email
 * (`email_sent_at IS NOT NULL`) with the joined offer + list metadata.
 *
 * Ordering (from most urgent to least):
 *  1. Not-closed contacts whose `next_step_at` falls on today or earlier, OR
 *     contacts that only had an email sent (no linkedin/whatsapp/call) and no
 *     next step scheduled — these go first.
 *  2. Everything else (including closed contacts) comes afterwards.
 *  3. Secondary tie-breaker: most recent `email_sent_at` first.
 */
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) throw redirect(302, "/login");

  const priorityExpr = sql<number>`CASE
      WHEN ${prospectContact.contactStatus} IS DISTINCT FROM 'closed'
       AND (
         (${prospectContact.nextStepAt} IS NOT NULL
           AND DATE(${prospectContact.nextStepAt}) <= CURRENT_DATE)
         OR (
           ${prospectContact.linkedinSentAt} IS NULL
           AND ${prospectContact.whatsappSentAt} IS NULL
           AND ${prospectContact.calledAt} IS NULL
           AND ${prospectContact.nextStepAt} IS NULL
         )
       )
      THEN 0
      ELSE 1
    END`;

  const rows = await db
    .select({
      id: prospectContact.id,
      fullName: prospectContact.fullName,
      linkedinUrl: prospectContact.linkedinUrl,
      email: prospectContact.email,
      email2: prospectContact.email2,
      phone1: prospectContact.phone1,
      phone2: prospectContact.phone2,
      offerId: prospectOffer.id,
      offerTitle: prospectOffer.offerTitle,
      companyName: prospectOffer.companyName,
      listId: prospectList.id,
      listName: prospectList.name,
      emailSentAt: prospectContact.emailSentAt,
      linkedinSentAt: prospectContact.linkedinSentAt,
      whatsappSentAt: prospectContact.whatsappSentAt,
      calledAt: prospectContact.calledAt,
      nextStepAt: prospectContact.nextStepAt,
      contactStatus: prospectContact.contactStatus,
      priority: priorityExpr,
    })
    .from(prospectContact)
    .innerJoin(prospectOffer, eq(prospectOffer.id, prospectContact.offerId))
    .innerJoin(prospectList, eq(prospectList.id, prospectOffer.listId))
    .where(
      and(
        eq(prospectList.userId, locals.user.id),
        isNotNull(prospectContact.emailSentAt)
      )
    )
    .orderBy(priorityExpr, sql`${prospectContact.emailSentAt} DESC`);

  return json(rows);
};
