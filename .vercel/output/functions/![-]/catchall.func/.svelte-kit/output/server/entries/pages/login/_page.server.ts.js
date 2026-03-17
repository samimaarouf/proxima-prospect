import { fail, redirect } from "@sveltejs/kit";
import { a as auth } from "../../../chunks/auth.js";
const load = async ({ locals }) => {
  if (locals.user) {
    throw redirect(302, "/");
  }
  return {};
};
const actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const email = formData.get("email");
    const password = formData.get("password");
    if (!email || !password) {
      return fail(400, { error: "Email et mot de passe requis" });
    }
    try {
      const result = await auth.api.signInEmail({
        body: { email, password },
        asResponse: true
      });
      if (!result.ok) {
        return fail(400, { error: "Email ou mot de passe incorrect" });
      }
      throw redirect(302, "/");
    } catch (err) {
      if (err instanceof Response || err?.status === 302) {
        throw err;
      }
      return fail(400, { error: "Connexion impossible. Vérifiez vos identifiants." });
    }
  }
};
export {
  actions,
  load
};
