import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sveltekitCookies } from "better-auth/svelte-kit";
import "./url.js";
import { getRequestEvent } from "@sveltejs/kit/internal/server";
import "./root.js";
import "./utils.js";
import "@sveltejs/kit";
import "@sveltejs/kit/internal";
import "./query.js";
import { d as db } from "./index2.js";
const auth = betterAuth({
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
