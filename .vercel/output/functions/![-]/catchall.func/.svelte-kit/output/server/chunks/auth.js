import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sveltekitCookies } from "better-auth/svelte-kit";
import "./url.js";
import { getRequestEvent } from "@sveltejs/kit/internal/server";
import "./root.js";
import { b as private_env } from "./shared-server.js";
import "./utils.js";
import "@sveltejs/kit";
import "@sveltejs/kit/internal";
import "./query.js";
import { d as db } from "./index2.js";
const auth = betterAuth({
  secret: private_env.BETTER_AUTH_SECRET || "dev-only-secret-change-me",
  baseURL: private_env.BETTER_AUTH_URL || private_env.PUBLIC_APP_URL,
  database: drizzleAdapter(db, {
    provider: "pg"
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24
  },
  plugins: [sveltekitCookies(getRequestEvent)]
});
export {
  auth as a
};
