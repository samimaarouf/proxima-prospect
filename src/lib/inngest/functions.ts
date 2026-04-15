import { inngest } from "./client";
import { db } from "$lib/server/db";
import { prospectContact, prospectOffer, prospectList, user } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";

const FULLENRICH_API = "https://app.fullenrich.com/api/v2";

export const fullenrichEnrich = inngest.createFunction(
  {
    id: "fullenrich-enrich",
    name: "Fullenrich Contact Enrichment",
    retries: 2,
    triggers: [{ event: "fullenrich/enrich" }],
  },
  async ({ event, step }) => {
    const { contactId, field, userId } = event.data as {
      contactId: string;
      field: "email" | "phone";
      userId: string;
    };

    // Fetch contact + API key
    const [row] = await step.run("fetch-contact", async () => {
      return db
        .select({
          id: prospectContact.id,
          linkedinUrl: prospectContact.linkedinUrl,
          fullName: prospectContact.fullName,
          companyName: prospectOffer.companyName,
          fullenrichApiKey: user.fullenrichApiKey,
        })
        .from(prospectContact)
        .innerJoin(prospectOffer, eq(prospectContact.offerId, prospectOffer.id))
        .innerJoin(prospectList, eq(prospectOffer.listId, prospectList.id))
        .innerJoin(user, eq(prospectList.userId, user.id))
        .where(eq(prospectContact.id, contactId))
        .limit(1);
    });

    if (!row?.fullenrichApiKey) throw new Error("Clé API Fullenrich manquante");

    const apiKey = row.fullenrichApiKey;
    const enrichFields = field === "email" ? ["contact.emails"] : ["contact.phones"];

    // Build payload
    const contactPayload: Record<string, unknown> = {
      enrich_fields: enrichFields,
      custom: { contact_id: contactId },
    };

    if (row.linkedinUrl) {
      contactPayload.linkedin_url = row.linkedinUrl;
    } else if (row.fullName) {
      const parts = row.fullName.trim().split(/\s+/);
      contactPayload.first_name = parts[0];
      contactPayload.last_name = parts.slice(1).join(" ") || parts[0];
      contactPayload.company_name = row.companyName;
    }

    // Start enrichment
    const enrichmentId = await step.run("start-enrichment", async () => {
      const res = await fetch(`${FULLENRICH_API}/contact/enrich/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          name: row.fullName ? `Enrichissement – ${row.fullName}` : `Enrichissement – ${contactId}`,
          data: [contactPayload],
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(err.message || `Fullenrich error ${res.status}`);
      }
      const data = await res.json() as { enrichment_id: string };
      return data.enrichment_id;
    });

    // Poll — Inngest step.sleep between each attempt (non-blocking, durable)
    let email: string | null = null;
    let phone: string | null = null;

    for (let i = 0; i < 30; i++) {
      await step.sleep(`poll-wait-${i}`, "5s");

      const result = await step.run(`poll-${i}`, async () => {
        const res = await fetch(`${FULLENRICH_API}/contact/enrich/bulk/${enrichmentId}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) return null;
        const data = await res.json() as { contacts?: Array<{ status?: string; most_probable_email?: string | null; most_probable_phone?: string | null; emails?: Array<{ email: string }>; phones?: Array<{ number: string }> }> };
        const contacts = data.contacts ?? [];
        if (contacts.length > 0 && contacts.every((c) => c.status === "done" || c.status === "error")) {
          return contacts[0];
        }
        return null;
      });

      if (result) {
        email = field !== "phone" ? (result.most_probable_email ?? result.emails?.[0]?.email ?? null) : null;
        phone = field !== "email" ? (result.most_probable_phone ?? result.phones?.[0]?.number ?? null) : null;
        break;
      }
    }

    // Update DB
    if (email || phone) {
      await step.run("update-db", async () => {
        await db
          .update(prospectContact)
          .set({
            ...(email ? { email } : {}),
            ...(phone ? { phone1: phone } : {}),
            updatedAt: new Date(),
          })
          .where(eq(prospectContact.id, contactId));
      });
    }

    return { contactId, field, email, phone, found: !!(email || phone) };
  }
);
