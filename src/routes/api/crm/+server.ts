import { json, redirect } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { prospectContact, prospectOffer, prospectList } from "$lib/server/db/schema";
import { and, eq, or, isNotNull, sql } from "drizzle-orm";
import type { RequestHandler } from "./$types";

/**
 * GET /api/crm
 *
 * Returns all contacts of the current user that have been contacted on at
 * least one channel (email, LinkedIn or WhatsApp), joined with their offer
 * and list metadata.
 *
 * Ordering (from most urgent to least):
 *  1. Not-closed contacts whose `next_step_at` is today or earlier, OR
 *     contacts that have no follow-up plan yet (no call and no next step).
 *  2. Everything else (including closed contacts) comes afterwards.
 *  3. Secondary tie-breaker: most recent send date across any channel.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) throw redirect(302, "/login");

  const listId = url.searchParams.get("listId");

  const priorityExpr = sql<number>`CASE
      WHEN ${prospectContact.contactStatus} IS DISTINCT FROM 'closed'
       AND (
         (${prospectContact.nextStepAt} IS NOT NULL
           AND DATE(${prospectContact.nextStepAt}) <= CURRENT_DATE)
         OR (
           ${prospectContact.calledAt} IS NULL
           AND ${prospectContact.nextStepAt} IS NULL
         )
       )
      THEN 0
      ELSE 1
    END`;

  const lastSentAtExpr = sql<Date | null>`GREATEST(
      ${prospectContact.emailSentAt},
      ${prospectContact.linkedinSentAt},
      ${prospectContact.whatsappSentAt}
    )`;

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
      offerUrl: prospectOffer.offerUrl,
      companyName: prospectOffer.companyName,
      offerDisabledAt: prospectOffer.disabledAt,
      listId: prospectList.id,
      listName: prospectList.name,
      emailSentAt: prospectContact.emailSentAt,
      linkedinSentAt: prospectContact.linkedinSentAt,
      whatsappSentAt: prospectContact.whatsappSentAt,
      calledAt: prospectContact.calledAt,
      nextStepAt: prospectContact.nextStepAt,
      nextStep: prospectContact.nextStep,
      contactStatus: prospectContact.contactStatus,
      notes: prospectContact.notes,
      inCrm: prospectContact.inCrm,
      priority: priorityExpr,
    })
    .from(prospectContact)
    .innerJoin(prospectOffer, eq(prospectOffer.id, prospectContact.offerId))
    .innerJoin(prospectList, eq(prospectList.id, prospectOffer.listId))
    .where(
      and(
        eq(prospectList.userId, locals.user.id),
        ...(listId ? [eq(prospectList.id, listId)] : []),
        // inCrm = false means explicitly removed from CRM; null = auto.
        // A contact appears in the CRM when:
        //   - inCrm is explicitly true (manually added), OR
        //   - inCrm is null (auto) AND has been contacted on at least one channel
        // Contacts with inCrm = false are always hidden.
        sql`${prospectContact.inCrm} IS DISTINCT FROM false`,
        or(
          eq(prospectContact.inCrm, true),
          isNotNull(prospectContact.emailSentAt),
          isNotNull(prospectContact.linkedinSentAt),
          isNotNull(prospectContact.whatsappSentAt),
        ),
      ),
    )
    .orderBy(priorityExpr, sql`${lastSentAtExpr} DESC NULLS LAST`);

  return json(rows);
};
