import { json } from "@sveltejs/kit";
import { d as db, p as prospectContact } from "../../../../../../chunks/index2.js";
import { eq } from "drizzle-orm";
const PATCH = async ({ locals, params, request }) => {
  if (!locals.user) {
    return json({ error: "Non authentifié" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const allowed = ["contactStatus", "aiMessage", "notes", "nextStep", "lastAction"];
  const updateData = { updatedAt: /* @__PURE__ */ new Date() };
  for (const key of allowed) {
    if (key in body) {
      updateData[key === "contactStatus" ? "contactStatus" : key === "aiMessage" ? "aiMessage" : key === "notes" ? "notes" : key === "nextStep" ? "nextStep" : "lastAction"] = body[key];
    }
  }
  const [updated] = await db.update(prospectContact).set(updateData).where(eq(prospectContact.id, params.id)).returning();
  return json(updated);
};
export {
  PATCH
};
