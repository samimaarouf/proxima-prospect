import { fail, redirect } from "@sveltejs/kit";
import { auth } from "$lib/auth";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user) {
    throw redirect(302, "/");
  }
  return {};
};

export const actions: Actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    if (!email || !password) {
      return fail(400, { error: "Email et mot de passe requis" });
    }

    try {
      const result = await auth.api.signInEmail({
        body: { email, password },
        asResponse: true,
      });

      if (!result.ok) {
        return fail(400, { error: "Email ou mot de passe incorrect" });
      }

      throw redirect(302, "/");
    } catch (err) {
      if (err instanceof Response || (err as { status?: number })?.status === 302) {
        throw err;
      }
      return fail(400, { error: "Connexion impossible. Vérifiez vos identifiants." });
    }
  },
};
