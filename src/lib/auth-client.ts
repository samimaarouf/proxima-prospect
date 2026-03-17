import { createAuthClient } from "better-auth/svelte";

export const authClient = createAuthClient({
  baseURL: import.meta.env.PUBLIC_APP_URL || "http://localhost:5173",
});

