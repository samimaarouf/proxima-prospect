export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set([]),
	mimeTypes: {},
	_: {
		client: {start:"_app/immutable/entry/start.CmYpOH9s.js",app:"_app/immutable/entry/app.Dvvkx25S.js",imports:["_app/immutable/entry/start.CmYpOH9s.js","_app/immutable/chunks/Dx6WdDKb.js","_app/immutable/chunks/BrOZ8OkI.js","_app/immutable/chunks/qMnzPoye.js","_app/immutable/entry/app.Dvvkx25S.js","_app/immutable/chunks/BrOZ8OkI.js","_app/immutable/chunks/BRmzkxwk.js","_app/immutable/chunks/qMnzPoye.js","_app/immutable/chunks/D5iOIJSG.js","_app/immutable/chunks/Djv2tefE.js","_app/immutable/chunks/D3DNjivt.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('../output/server/nodes/0.js')),
			__memo(() => import('../output/server/nodes/1.js')),
			__memo(() => import('../output/server/nodes/2.js')),
			__memo(() => import('../output/server/nodes/3.js')),
			__memo(() => import('../output/server/nodes/4.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			},
			{
				id: "/api/auth/[...all]",
				pattern: /^\/api\/auth(?:\/([^]*))?\/?$/,
				params: [{"name":"all","optional":false,"rest":true,"chained":true}],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/auth/_...all_/_server.ts.js'))
			},
			{
				id: "/api/contacts/bulk-delete",
				pattern: /^\/api\/contacts\/bulk-delete\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/contacts/bulk-delete/_server.ts.js'))
			},
			{
				id: "/api/contacts/[id]",
				pattern: /^\/api\/contacts\/([^/]+?)\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/contacts/_id_/_server.ts.js'))
			},
			{
				id: "/api/contacts/[id]/enrich-linkedin",
				pattern: /^\/api\/contacts\/([^/]+?)\/enrich-linkedin\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/contacts/_id_/enrich-linkedin/_server.ts.js'))
			},
			{
				id: "/api/contacts/[id]/generate-message",
				pattern: /^\/api\/contacts\/([^/]+?)\/generate-message\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/contacts/_id_/generate-message/_server.ts.js'))
			},
			{
				id: "/api/contacts/[id]/send",
				pattern: /^\/api\/contacts\/([^/]+?)\/send\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/contacts/_id_/send/_server.ts.js'))
			},
			{
				id: "/api/contacts/[id]/update-status",
				pattern: /^\/api\/contacts\/([^/]+?)\/update-status\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/contacts/_id_/update-status/_server.ts.js'))
			},
			{
				id: "/api/image-proxy",
				pattern: /^\/api\/image-proxy\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/image-proxy/_server.ts.js'))
			},
			{
				id: "/api/lists",
				pattern: /^\/api\/lists\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/lists/_server.ts.js'))
			},
			{
				id: "/api/lists/[id]",
				pattern: /^\/api\/lists\/([^/]+?)\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/lists/_id_/_server.ts.js'))
			},
			{
				id: "/api/lists/[id]/import",
				pattern: /^\/api\/lists\/([^/]+?)\/import\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/lists/_id_/import/_server.ts.js'))
			},
			{
				id: "/api/offers/[id]/scrape",
				pattern: /^\/api\/offers\/([^/]+?)\/scrape\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/offers/_id_/scrape/_server.ts.js'))
			},
			{
				id: "/lists/[id]",
				pattern: /^\/lists\/([^/]+?)\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,], errors: [1,], leaf: 3 },
				endpoint: null
			},
			{
				id: "/login",
				pattern: /^\/login\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 4 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
