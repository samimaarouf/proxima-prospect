import { Inngest } from "inngest";
import { INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY } from "$env/static/private";

export const inngest = new Inngest({
  id: "proxima-prospect",
  name: "Proxima Prospect",
  eventKey: INNGEST_EVENT_KEY,
  signingKey: INNGEST_SIGNING_KEY,
});
