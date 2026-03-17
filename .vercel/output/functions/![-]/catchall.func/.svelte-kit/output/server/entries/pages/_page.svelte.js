import { e as ensure_array_like, b as attr } from "../../chunks/index3.js";
import { e as escape_html } from "../../chunks/escaping.js";
import "@sveltejs/kit/internal";
import "../../chunks/url.js";
import "../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../chunks/root.js";
import "../../chunks/exports.js";
import "../../chunks/state.svelte.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { data } = $$props;
    let lists = data.lists;
    function formatDate(dateStr) {
      return new Date(dateStr).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
    }
    $$renderer2.push(`<div class="min-h-screen bg-background"><header class="border-b border-border bg-card px-6 py-4 flex items-center justify-between"><div class="flex items-center gap-3"><div class="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">P</div> <div><h1 class="text-lg font-semibold">Proxima Prospect</h1> <p class="text-xs text-muted-foreground">Gestion des prospections</p></div></div> <div class="flex items-center gap-4"><span class="text-sm text-muted-foreground">${escape_html(data.user?.email)}</span> <form method="POST" action="/api/auth/sign-out"><button type="submit" class="text-sm text-muted-foreground hover:text-foreground transition-colors">Déconnexion</button></form></div></header> <main class="max-w-6xl mx-auto px-6 py-8"><div class="flex items-center justify-between mb-8"><div><h2 class="text-2xl font-bold">Listes de prospection</h2> <p class="text-sm text-muted-foreground mt-1">${escape_html(lists.length)} liste${escape_html(lists.length !== 1 ? "s" : "")}</p></div> <button class="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Nouvelle liste</button></div> `);
    if (lists.length === 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="text-center py-20 text-muted-foreground"><div class="text-5xl mb-4">📋</div> <p class="text-lg font-medium mb-2">Aucune liste de prospection</p> <p class="text-sm">Créez votre première liste pour commencer</p></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"><!--[-->`);
      const each_array = ensure_array_like(lists);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let list = each_array[$$index];
        $$renderer2.push(`<div class="border border-border rounded-xl bg-card p-5 hover:shadow-md transition-shadow group"><div class="flex items-start justify-between mb-3"><a${attr("href", `/lists/${list.id}`)} class="font-semibold text-foreground hover:text-primary transition-colors truncate flex-1 mr-2">${escape_html(list.name)}</a> <button class="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-1 rounded" title="Supprimer"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4h6v2"></path></svg></button></div> `);
        if (list.pitch) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<p class="text-sm text-muted-foreground line-clamp-2 mb-3">${escape_html(list.pitch)}</p>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--> <div class="flex items-center justify-between text-xs text-muted-foreground"><span>Créée le ${escape_html(formatDate(list.createdAt))}</span> <a${attr("href", `/lists/${list.id}`)} class="text-primary hover:underline font-medium">Ouvrir →</a></div></div>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    }
    $$renderer2.push(`<!--]--></main></div> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
export {
  _page as default
};
