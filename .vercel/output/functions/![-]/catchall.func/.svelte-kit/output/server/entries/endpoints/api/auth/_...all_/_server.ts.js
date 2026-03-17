import { a as auth } from "../../../../../chunks/auth.js";
const GET = ({ request }) => auth.handler(request);
const POST = ({ request }) => auth.handler(request);
export {
  GET,
  POST
};
