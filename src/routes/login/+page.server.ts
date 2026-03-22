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
  login: async ({ request }) => {
    const formData = await request.formData();
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    if (!email || !password) {
      return fail(400, { mode: "login", error: "Email et mot de passe requis" });
    }

    try {
      const result = await auth.api.signInEmail({
        body: { email, password },
        asResponse: true,
      });

      if (!result.ok) {
        return fail(400, { mode: "login", error: "Email ou mot de passe incorrect" });
      }

      throw redirect(302, "/");
    } catch (err) {
      if ((err as { status?: number })?.status === 302 || err instanceof Response) throw err;
      return fail(400, { mode: "login", error: "Connexion impossible. Vérifiez vos identifiants." });
    }
  },

  register: async ({ request }) => {
    const formData = await request.formData();
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (!name || !email || !password) {
      return fail(400, { mode: "register", error: "Tous les champs sont requis" });
    }

    if (password.length < 8) {
      return fail(400, { mode: "register", error: "Le mot de passe doit faire au moins 8 caractères" });
    }

    if (password !== confirmPassword) {
      return fail(400, { mode: "register", error: "Les mots de passe ne correspondent pas" });
    }

    try {
      const result = await auth.api.signUpEmail({
        body: { name, email, password },
        asResponse: true,
      });

      if (!result.ok) {
        const body = await result.json().catch(() => ({}));
        const msg = body?.message || body?.error || "Inscription impossible";
        return fail(400, { mode: "register", error: msg });
      }

      throw redirect(302, "/");
    } catch (err) {
      if ((err as { status?: number })?.status === 302 || err instanceof Response) throw err;
      return fail(400, { mode: "register", error: "Inscription impossible. Cet email est peut-être déjà utilisé." });
    }
  },
};
