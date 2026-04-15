import { redirect } from "@sveltejs/kit";
import type { Handle } from "@sveltejs/kit";
import { auth } from "$lib/auth";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { building } from "$app/environment";

const publicRoutes = ["/login", "/api/inngest"];

export const handle: Handle = async ({ event, resolve }) => {
  const { url } = event;
  const pathname = url.pathname;

  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
  const isApiRoute = pathname.startsWith("/api/");

  let session = null;
  try {
    session = await auth.api.getSession({
      headers: event.request.headers,
    });
  } catch {
    session = null;
  }

  if (session) {
    event.locals.session = session.session;
    event.locals.user = session.user;
  } else {
    event.locals.user = null;
    event.locals.session = null;
  }

  if (!isPublicRoute && !isApiRoute && !event.locals.user) {
    throw redirect(302, `/login?redirect=${encodeURIComponent(pathname)}`);
  }

  if (isPublicRoute && event.locals.user && event.request.method !== "POST") {
    throw redirect(302, "/");
  }

  return svelteKitHandler({ event, resolve, auth, building });
};
