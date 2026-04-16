<script lang="ts">
  import { toast } from "svelte-sonner";
  import { page } from "$app/state";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const connectedType = $derived(page.url.searchParams.get("connected"));
  const errorType = $derived(page.url.searchParams.get("error"));

  const connectedLabels: Record<string, string> = {
    linkedin: "LinkedIn",
    whatsapp: "WhatsApp",
    email: "Email",
  };

  $effect(() => {
    if (connectedType) {
      toast.success(`${connectedLabels[connectedType] ?? connectedType} connecté avec succès !`);
    }
    if (errorType === "connection_failed") {
      toast.error("La connexion a échoué. Veuillez réessayer.");
    } else if (errorType === "no_account_found") {
      toast.error("Compte introuvable. Vérifiez que vous avez bien complété l'authentification.");
    } else if (errorType) {
      toast.error("Une erreur est survenue.");
    }
  });

  let connecting = $state<string | null>(null);

  // Coresignal multi-keys
  type CoresignalKey = { id: string; label: string | null; apiKeyMasked: string; isActive: boolean; lastUsedAt: string | null; order: number };
  let coresignalKeys = $state<CoresignalKey[]>([]);
  let loadingKeys = $state(false);
  let newKeyValue = $state("");
  let newKeyLabel = $state("");
  let addingKey = $state(false);

  async function loadCoresignalKeys() {
    loadingKeys = true;
    try {
      const res = await fetch("/api/settings/coresignal-keys");
      if (res.ok) coresignalKeys = await res.json();
    } catch { /* silent */ } finally {
      loadingKeys = false;
    }
  }

  async function addCoresignalKey() {
    if (!newKeyValue.trim()) return;
    addingKey = true;
    try {
      const res = await fetch("/api/settings/coresignal-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: newKeyValue.trim(), label: newKeyLabel.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      coresignalKeys = [...coresignalKeys, data];
      newKeyValue = "";
      newKeyLabel = "";
      toast.success("Clé ajoutée !");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      addingKey = false;
    }
  }

  async function deleteCoresignalKey(id: string) {
    try {
      const res = await fetch("/api/settings/coresignal-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error();
      coresignalKeys = coresignalKeys.filter((k) => k.id !== id);
      toast.success("Clé supprimée");
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  }

  async function toggleCoresignalKey(key: CoresignalKey) {
    try {
      const res = await fetch("/api/settings/coresignal-keys", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: key.id, isActive: !key.isActive }),
      });
      const updated = await res.json();
      if (!res.ok) throw new Error();
      coresignalKeys = coresignalKeys.map((k) => k.id === key.id ? updated : k);
    } catch {
      toast.error("Erreur");
    }
  }

  $effect(() => { loadCoresignalKeys(); });

  // Fullenrich API key
  let fullenrichKey = $state(data.fullenrichApiKey ?? "");
  let savingFullenrichKey = $state(false);

  async function saveFullenrichKey() {
    savingFullenrichKey = true;
    try {
      const fd = new FormData();
      fd.append("key", fullenrichKey);
      const res = await fetch("?/saveFullenrichKey", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Erreur");
      toast.success("Clé Fullenrich sauvegardée !");
    } catch {
      toast.error("Impossible de sauvegarder la clé.");
    } finally {
      savingFullenrichKey = false;
    }
  }

  const channels = [
    {
      key: "LINKEDIN",
      label: "LinkedIn",
      description: "Envoyez des messages et des demandes de connexion via LinkedIn",
      icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="#0a66c2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`,
      account: data.linkedinAccount,
    },
    {
      key: "WHATSAPP",
      label: "WhatsApp",
      description: "Envoyez des messages WhatsApp à vos contacts",
      icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="#25d366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>`,
      account: data.whatsappAccount,
    },
    {
      key: "EMAIL",
      label: "Email",
      description: "Connectez votre boîte mail Google, Microsoft ou IMAP",
      icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
      account: data.emailAccount,
    },
  ] as const;

  async function connect(type: string) {
    connecting = type;
    try {
      const res = await fetch("/api/settings/connect-unipile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur");
      window.open(json.url, "_blank", "width=600,height=700,noopener");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible de générer le lien de connexion");
    } finally {
      connecting = null;
    }
  }
</script>

<div class="min-h-screen bg-background">
  <!-- Header -->
  <header class="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <a href="/" class="flex items-center gap-3 hover:opacity-80 transition-opacity">
        <div class="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
          P
        </div>
        <div>
          <h1 class="text-lg font-semibold">Proxima Entreprise</h1>
          <p class="text-xs text-muted-foreground">Paramètres</p>
        </div>
      </a>
    </div>
    <a href="/" class="text-sm text-muted-foreground hover:text-foreground transition-colors">
      ← Retour aux listes
    </a>
  </header>

  <main class="max-w-2xl mx-auto px-6 py-10 space-y-8">
    <div>
      <h2 class="text-2xl font-bold">Connexions Unipile</h2>
      <p class="text-sm text-muted-foreground mt-1">
        Connectez vos comptes pour envoyer des messages depuis Proxima Prospect.
      </p>
    </div>

    <div class="space-y-4">
      {#each channels as ch}
        {@const isConnected = !!ch.account}
        <div class="border border-border rounded-xl bg-card p-5 flex items-start gap-4">
          <!-- Icon -->
          <div class="mt-0.5 shrink-0">
            {@html ch.icon}
          </div>

          <!-- Info -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-semibold text-sm">{ch.label}</span>
              {#if isConnected}
                <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                  <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                  Connecté
                </span>
              {:else}
                <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  <span class="w-1.5 h-1.5 rounded-full bg-muted-foreground/50"></span>
                  Non connecté
                </span>
              {/if}
            </div>
            <p class="text-xs text-muted-foreground mt-0.5">{ch.description}</p>
            {#if isConnected && ch.account?.name}
              <p class="text-xs text-foreground font-medium mt-1 truncate">{ch.account.name}</p>
            {/if}
          </div>

          <!-- Actions -->
          <div class="shrink-0 flex gap-2">
            {#if isConnected}
              <form method="POST" action="?/disconnect">
                <input type="hidden" name="type" value={ch.key} />
                <button
                  type="submit"
                  class="px-3 py-1.5 text-xs border border-destructive/30 text-destructive rounded-md hover:bg-destructive/5 transition-colors"
                  onclick={(e) => { if (!confirm(`Déconnecter ${ch.label} ?`)) e.preventDefault(); }}
                >
                  Déconnecter
                </button>
              </form>
              <button
                onclick={() => connect(ch.key)}
                disabled={connecting === ch.key}
                class="px-3 py-1.5 text-xs border border-input rounded-md hover:bg-accent transition-colors disabled:opacity-50"
              >
                Reconnecter
              </button>
            {:else}
              <button
                onclick={() => connect(ch.key)}
                disabled={connecting === ch.key}
                class="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {#if connecting === ch.key}
                  <span class="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  Génération…
                {:else}
                  Connecter
                {/if}
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>

    <!-- Info box Unipile -->
    <div class="rounded-lg border border-blue-100 bg-blue-50 p-4 text-xs text-blue-700 space-y-1">
      <p class="font-semibold">Comment ça marche ?</p>
      <p>Cliquez sur "Connecter", une fenêtre Unipile s'ouvre. Authentifiez-vous avec votre compte, puis revenez ici et rafraîchissez la page pour confirmer la connexion.</p>
    </div>

    <!-- Coresignal -->
    <div>
      <h2 class="text-2xl font-bold">Coresignal</h2>
      <p class="text-sm text-muted-foreground mt-1">
        Clés API pour la recherche de décisionnaires. Ajoutez plusieurs clés — elles s'enchaînent automatiquement quand l'une est épuisée. Obtenez-les sur <a href="https://coresignal.com" target="_blank" class="underline hover:text-foreground">coresignal.com</a>.
      </p>
    </div>

    <div class="border border-border rounded-xl bg-card p-5 space-y-4">
      <!-- Keys list -->
      {#if loadingKeys}
        <p class="text-sm text-muted-foreground">Chargement…</p>
      {:else if coresignalKeys.length === 0}
        <p class="text-sm text-muted-foreground italic">Aucune clé configurée.</p>
      {:else}
        <div class="space-y-2">
          {#each coresignalKeys as key (key.id)}
            <div class="flex items-center gap-3 px-3 py-2.5 border border-border rounded-lg bg-muted/20">
              <!-- Status indicator -->
              <button
                type="button"
                onclick={() => toggleCoresignalKey(key)}
                title={key.isActive ? "Active – cliquer pour désactiver" : "Inactive – cliquer pour réactiver"}
                class="shrink-0"
              >
                {#if key.isActive}
                  <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                    <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                    Active
                  </span>
                {:else}
                  <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">
                    <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                    Épuisée
                  </span>
                {/if}
              </button>

              <!-- Key info -->
              <div class="flex-1 min-w-0">
                <p class="text-sm font-mono text-muted-foreground truncate">{key.apiKeyMasked}</p>
                {#if key.label}
                  <p class="text-xs text-muted-foreground/70 truncate">{key.label}</p>
                {/if}
              </div>

              {#if key.lastUsedAt}
                <p class="text-xs text-muted-foreground shrink-0 hidden sm:block">
                  Utilisée {new Date(key.lastUsedAt).toLocaleDateString("fr-FR")}
                </p>
              {/if}

              <!-- Delete -->
              <button
                type="button"
                onclick={() => deleteCoresignalKey(key.id)}
                class="p-1.5 rounded hover:bg-red-50 hover:text-red-500 text-muted-foreground transition-colors shrink-0"
                title="Supprimer cette clé"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              </button>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Add new key -->
      <div class="space-y-2 pt-2 border-t border-border">
        <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ajouter une clé</p>
        <div class="flex gap-2">
          <input
            type="text"
            bind:value={newKeyLabel}
            placeholder="Label (optionnel)"
            class="w-32 px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            type="password"
            bind:value={newKeyValue}
            placeholder="Clé API Coresignal…"
            class="flex-1 px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring font-mono"
            autocomplete="off"
            onkeydown={(e) => e.key === "Enter" && addCoresignalKey()}
          />
          <button
            onclick={addCoresignalKey}
            disabled={addingKey || !newKeyValue.trim()}
            class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
          >
            {addingKey ? "…" : "Ajouter"}
          </button>
        </div>
      </div>
    </div>
    <!-- Fullenrich -->
    <div>
      <h2 class="text-2xl font-bold">Fullenrich</h2>
      <p class="text-sm text-muted-foreground mt-1">
        Clé API pour enrichir les contacts avec leur email et téléphone. Obtenez-la sur <a href="https://fullenrich.com" target="_blank" class="underline hover:text-foreground">fullenrich.com</a>.
      </p>
    </div>

    <div class="border border-border rounded-xl bg-card p-5 space-y-4">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <div class="flex-1 min-w-0">
          <p class="font-semibold text-sm">API Key</p>
          <p class="text-xs text-muted-foreground">Utilisée pour retrouver l'email et le téléphone d'un contact via LinkedIn</p>
        </div>
        {#if data.fullenrichApiKey}
          <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium shrink-0">
            <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>
            Configurée
          </span>
        {:else}
          <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
            <span class="w-1.5 h-1.5 rounded-full bg-muted-foreground/50"></span>
            Non configurée
          </span>
        {/if}
      </div>

      <div class="flex gap-2">
        <input
          type="password"
          bind:value={fullenrichKey}
          placeholder="Collez votre clé API Fullenrich…"
          class="flex-1 px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring font-mono"
          autocomplete="off"
        />
        <button
          onclick={saveFullenrichKey}
          disabled={savingFullenrichKey}
          class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
        >
          {savingFullenrichKey ? "Sauvegarde…" : "Sauvegarder"}
        </button>
        {#if fullenrichKey}
          <button
            onclick={() => { fullenrichKey = ""; saveFullenrichKey(); }}
            class="px-3 py-2 text-sm border border-destructive/30 text-destructive rounded-md hover:bg-destructive/5 transition-colors shrink-0"
          >
            Supprimer
          </button>
        {/if}
      </div>
    </div>
  </main>
</div>
