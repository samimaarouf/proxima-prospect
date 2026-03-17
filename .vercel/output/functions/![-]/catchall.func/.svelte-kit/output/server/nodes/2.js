import * as server from '../entries/pages/_page.server.ts.js';

export const index = 2;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/+page.server.ts";
export const imports = ["_app/immutable/nodes/2.Cl_XlwYi.js","_app/immutable/chunks/BRmzkxwk.js","_app/immutable/chunks/BrOZ8OkI.js","_app/immutable/chunks/D5iOIJSG.js","_app/immutable/chunks/DBXkN1EG.js","_app/immutable/chunks/B1kOwqnV.js","_app/immutable/chunks/O8G-_ZGx.js","_app/immutable/chunks/qMnzPoye.js"];
export const stylesheets = [];
export const fonts = [];
