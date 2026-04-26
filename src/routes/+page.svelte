<script lang="ts">
  import { toast } from "svelte-sonner";
  import { goto } from "$app/navigation";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let lists = $state(data.lists);
  let showCreateDialog = $state(false);
  let newListName = $state("");
  let newListPitch = $state("");
  let creating = $state(false);

  async function createList() {
    if (!newListName.trim()) {
      toast.error("Le nom de la liste est requis");
      return;
    }
    creating = true;
    try {
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newListName.trim(), pitch: newListPitch.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      const newList = await res.json();
      lists = [newList, ...lists];
      showCreateDialog = false;
      newListName = "";
      newListPitch = "";
      toast.success("Liste créée avec succès");
      goto(`/lists/${newList.id}`);
    } catch (err) {
      toast.error("Erreur lors de la création de la liste");
    } finally {
      creating = false;
    }
  }

  async function deleteList(id: string, name: string) {
    if (!confirm(`Supprimer la liste "${name}" ?`)) return;
    try {
      const res = await fetch(`/api/lists/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      lists = lists.filter((l) => l.id !== id);
      toast.success("Liste supprimée");
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  }

  function formatDate(dateStr: string | Date) {
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }
</script>

<div class="min-h-screen bg-background">
  <!-- Header -->
  <header class="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div class="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
        P
      </div>
      <div>
      <h1 class="text-lg font-semibold">Proxima Entreprise</h1>
          <p class="text-xs text-muted-foreground">Gestion des prospections</p>
      </div>
    </div>
    <div class="flex items-center gap-4">
      <span class="text-sm text-muted-foreground">{data.user?.email}</span>
      <a href="/settings" class="text-sm text-muted-foreground hover:text-foreground transition-colors">
        Paramètres
      </a>
      <form method="POST" action="/api/auth/sign-out">
        <button type="submit" class="text-sm text-muted-foreground hover:text-foreground transition-colors">
          Déconnexion
        </button>
      </form>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-6 py-8">
    <div class="flex items-center justify-between mb-8">
      <div>
        <h2 class="text-2xl font-bold">Listes de prospection</h2>
        <p class="text-sm text-muted-foreground mt-1">
          {lists.length} liste{lists.length !== 1 ? "s" : ""}
        </p>
      </div>
      <button
        onclick={() => (showCreateDialog = true)}
        class="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        Nouvelle liste
      </button>
    </div>

    {#if lists.length === 0}
      <div class="text-center py-20 text-muted-foreground">
        <div class="text-5xl mb-4">📋</div>
        <p class="text-lg font-medium mb-2">Aucune liste de prospection</p>
        <p class="text-sm">Créez votre première liste pour commencer</p>
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each lists as list}
          <div class="border border-border rounded-xl bg-card p-5 hover:shadow-md transition-shadow group">
            <div class="flex items-start justify-between mb-3">
              <a
                href={`/lists/${list.id}`}
                class="font-semibold text-foreground hover:text-primary transition-colors truncate flex-1 mr-2"
              >
                {list.name}
              </a>
              <button
                onclick={() => deleteList(list.id, list.name)}
                class="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-1 rounded"
                title="Supprimer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6l-1 14H6L5 6"></path>
                  <path d="M10 11v6"></path>
                  <path d="M14 11v6"></path>
                  <path d="M9 6V4h6v2"></path>
                </svg>
              </button>
            </div>
            {#if list.pitch}
              <p class="text-sm text-muted-foreground line-clamp-2 mb-3">{list.pitch}</p>
            {/if}
            <div class="flex items-center justify-between text-xs text-muted-foreground">
              <span>Créée le {formatDate(list.createdAt)}</span>
              <a
                href={`/lists/${list.id}`}
                class="text-primary hover:underline font-medium"
              >
                Ouvrir →
              </a>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </main>
</div>

<!-- Create list dialog -->
{#if showCreateDialog}
  <div
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    onclick={(e) => { if (e.target === e.currentTarget) showCreateDialog = false; }}
  >
    <div class="bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-6 space-y-5">
      <div>
        <h3 class="text-lg font-semibold">Nouvelle liste de prospection</h3>
        <p class="text-sm text-muted-foreground mt-1">Créez une nouvelle campagne de prospection</p>
      </div>

      <div class="space-y-4">
        <div class="space-y-1">
          <label for="list-name" class="text-sm font-medium">Nom de la liste *</label>
          <input
            id="list-name"
            bind:value={newListName}
            type="text"
            placeholder="Ex: Campagne Q1 2026"
            class="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            onkeydown={(e) => e.key === "Enter" && createList()}
          />
        </div>

        <div class="space-y-1">
          <label for="list-pitch" class="text-sm font-medium">Pitch / Informations recruteur</label>
          <textarea
            id="list-pitch"
            bind:value={newListPitch}
            rows={4}
            placeholder="Décrivez votre expertise, votre entreprise, ce que vous proposez aux prospects..."
            class="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          ></textarea>
          <p class="text-xs text-muted-foreground">Ces informations seront utilisées pour générer les messages personnalisés.</p>
        </div>
      </div>

      <div class="flex gap-3 justify-end">
        <button
          onclick={() => { showCreateDialog = false; newListName = ""; newListPitch = ""; }}
          class="px-4 py-2 text-sm border border-input rounded-md hover:bg-accent transition-colors"
        >
          Annuler
        </button>
        <button
          onclick={createList}
          disabled={creating}
          class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {creating ? "Création..." : "Créer la liste"}
        </button>
      </div>
    </div>
  </div>
{/if}
