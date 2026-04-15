import { serve } from "inngest/sveltekit";
import { inngest } from "$lib/inngest/client";
import { fullenrichEnrich } from "$lib/inngest/functions";

const inngestHandler = serve({
  client: inngest,
  functions: [fullenrichEnrich],
});

export const GET = inngestHandler;
export const POST = inngestHandler;
export const PUT = inngestHandler;
