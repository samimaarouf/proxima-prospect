import { json } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import {
  prospectContact,
  prospectList,
  prospectOffer,
} from "$lib/server/db/schema";
import { eq, inArray } from "drizzle-orm";
import type { RequestHandler } from "./$types";
import { companyMatches } from "$lib/server/offerMatch";

/**
 * GET /api/companies/:name
 *
 * Aggregates everything we know about a given company across the user's lists:
 * all offers (including disabled ones), all contacts attached to those offers,
 * plus a few derived metrics for the CompanySheet.
 *
 * We match on normalized company name (fuzzy / prefix-based), not on a
 * dedicated `company_id`, so this automatically picks up sloppy variants like
 * "Pixalione" ≡ "PIXALIONE | SEO, Paid, IA, Data & CRO".
 */
export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) {
    return json({ error: "Non authentifié" }, { status: 401 });
  }

  const name = decodeURIComponent(params.name).trim();
  if (!name) {
    return json({ error: "Nom d'entreprise manquant" }, { status: 400 });
  }

  // Pull every offer the user owns, then filter in JS using `companyMatches`.
  // Volumes are small (per-user), so a single scan is simpler and correct.
  const userOffers = await db
    .select({
      id: prospectOffer.id,
      listId: prospectOffer.listId,
      listName: prospectList.name,
      companyName: prospectOffer.companyName,
      offerTitle: prospectOffer.offerTitle,
      offerUrl: prospectOffer.offerUrl,
      offerLocation: prospectOffer.offerLocation,
      offerContent: prospectOffer.offerContent,
      disabledAt: prospectOffer.disabledAt,
      createdAt: prospectOffer.createdAt,
    })
    .from(prospectOffer)
    .innerJoin(prospectList, eq(prospectList.id, prospectOffer.listId))
    .where(eq(prospectList.userId, locals.user.id));

  const offers = userOffers.filter((o) => companyMatches(o.companyName, name));

  if (offers.length === 0) {
    return json(
      { error: "Aucune offre trouvée pour cette entreprise" },
      { status: 404 },
    );
  }

  const offerIds = offers.map((o) => o.id);

  const contactsRaw = offerIds.length
    ? await db
        .select()
        .from(prospectContact)
        .where(inArray(prospectContact.offerId, offerIds))
    : [];

  // Enrich contacts with their offer's company/url for display convenience.
  const offerById = new Map(offers.map((o) => [o.id, o] as const));
  const contacts = contactsRaw.map((c) => {
    const o = offerById.get(c.offerId);
    return {
      ...c,
      companyName: o?.companyName ?? "",
      offerTitle: o?.offerTitle ?? null,
      offerUrl: o?.offerUrl ?? null,
      offerDisabled: !!o?.disabledAt,
    };
  });

  // Best-effort display name: prefer the longest variant we've seen (usually
  // the fully-qualified one from Coresignal/linkedin) over the shortest.
  const displayName = offers
    .map((o) => o.companyName)
    .sort((a, b) => b.length - a.length)[0];

  // Last sent across all channels, all contacts.
  const lastContactAt = contactsRaw.reduce<Date | null>((acc, c) => {
    const candidates = [c.emailSentAt, c.linkedinSentAt, c.whatsappSentAt]
      .filter(Boolean)
      .map((d) => (d ? new Date(d) : null))
      .filter((d): d is Date => d !== null);
    const latest = candidates.length
      ? candidates.reduce((a, b) => (a > b ? a : b))
      : null;
    if (!latest) return acc;
    return acc && acc > latest ? acc : latest;
  }, null);

  // Try to extract company metadata from the first contact that has a
  // LinkedIn-enriched payload with a `current_company` object.
  let companyMeta: {
    website?: string | null;
    industry?: string | null;
    headcount?: string | null;
    location?: string | null;
    about?: string | null;
    logoUrl?: string | null;
  } = {};
  for (const c of contactsRaw) {
    const d = (c.linkedinData ?? null) as Record<string, unknown> | null;
    const cc =
      (d?.current_company as Record<string, unknown> | undefined) ??
      (d?.currentCompany as Record<string, unknown> | undefined);
    if (!cc) continue;
    companyMeta = {
      website: (cc.website as string) || (cc.company_website as string) || null,
      industry: (cc.industry as string) || null,
      headcount:
        (cc.employee_count_range as string) ||
        (cc.company_size as string) ||
        (cc.staff_count as string) ||
        null,
      location: (cc.location as string) || (cc.headquarter as string) || null,
      about: (cc.description as string) || (cc.about as string) || null,
      logoUrl:
        (cc.logo_url as string) ||
        (cc.logo as string) ||
        (cc.company_logo_url as string) ||
        null,
    };
    if (companyMeta.website || companyMeta.industry || companyMeta.about) break;
  }

  return json({
    name: displayName,
    meta: companyMeta,
    stats: {
      totalOffers: offers.length,
      activeOffers: offers.filter((o) => !o.disabledAt).length,
      totalContacts: contacts.length,
      contactsWithLinkedin: contacts.filter((c) => c.linkedinUrl).length,
      lastContactAt,
    },
    offers,
    contacts,
  });
};
