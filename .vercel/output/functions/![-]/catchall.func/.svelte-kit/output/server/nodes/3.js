import * as server from '../entries/pages/lists/_id_/_page.server.ts.js';

export const index = 3;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/lists/_id_/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/lists/[id]/+page.server.ts";
export const imports = ["_app/immutable/nodes/3.DAHFAqpz.js","_app/immutable/chunks/BRmzkxwk.js","_app/immutable/chunks/BrOZ8OkI.js","_app/immutable/chunks/D5iOIJSG.js","_app/immutable/chunks/DBXkN1EG.js","_app/immutable/chunks/B1kOwqnV.js","_app/immutable/chunks/D3DNjivt.js","_app/immutable/chunks/qMnzPoye.js"];
export const stylesheets = ["_app/immutable/assets/3.CnJD9e3D.css"];
export const fonts = [];
