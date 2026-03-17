import * as server from '../entries/pages/login/_page.server.ts.js';

export const index = 4;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/login/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/login/+page.server.ts";
export const imports = ["_app/immutable/nodes/4.Op3debf-.js","_app/immutable/chunks/BRmzkxwk.js","_app/immutable/chunks/BrOZ8OkI.js","_app/immutable/chunks/D5iOIJSG.js"];
export const stylesheets = [];
export const fonts = [];
