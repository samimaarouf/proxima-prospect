<script lang="ts">
  import { toast } from "svelte-sonner";

  type Offer = {
    id: string;
    listId: string;
    listName: string;
    companyName: string;
    offerTitle: string | null;
    offerUrl: string | null;
    offerLocation: string | null;
    disabledAt: string | Date | null;
    createdAt: string;
  };

  type Contact = {
    id: string;
    offerId: string;
    fullName: string | null;
    jobTitle: string | null;
    linkedinUrl: string | null;
    email: string | null;
    phone1: string | null;
    offerTitle: string | null;
    offerDisabled?: boolean;
    emailSentAt?: string | null;
    linkedinSentAt?: string | null;
    whatsappSentAt?: string | null;
  };

  type CompanyPayload = {
    name: string;
    meta: {
      website?: string | null;
      industry?: string | null;
      headcount?: string | null;
      location?: string | null;
      about?: string | null;
      logoUrl?: string | null;
    };
    stats: {
      totalOffers: number;
      activeOffers: number;
      totalContacts: number;
      contactsWithLinkedin: number;
      lastContactAt: string | null;
    };
    offers: Offer[];
    contacts: Contact[];
  };

  let {
    companyName,
    onClose,
    onOfferClick,
  }: {
    companyName: string;
    onClose: () => void;
    /** Called when the user wants to jump into a specific offer sheet. */
    onOfferClick?: (offer: Offer) => void;
  } = $props();

  let loading = $state(true);
  let data = $state<CompanyPayload | null>(null);
  let togglingFor = $state<string | null>(null);

  async function load() {
    loading = true;
    try {
      const res = await fetch(`/api/companies/${encodeURIComponent(companyName)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erreur");
      }
      data = await res.json();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de chargement");
      data = null;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (companyName) load();
  });

  async function toggleOfferDisabled(offer: Offer) {
    togglingFor = offer.id;
    const willDisable = !offer.disabledAt;
    try {
      const res = await fetch(`/api/offers/${offer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: willDisable }),
      });
      const updated = await res.json();
      if (!res.ok) throw new Error(updated.error || "Erreur");
      if (data) {
        data = {
          ...data,
          offers: data.offers.map((o) =>
            o.id === offer.id ? { ...o, disabledAt: updated.disabledAt } : o,
          ),
          stats: {
            ...data.stats,
            activeOffers: data.offers.filter(
              (o) => (o.id === offer.id ? !updated.disabledAt : !o.disabledAt),
            ).length,
          },
        };
      }
      toast.success(updated.disabledAt ? "Offre désactivée" : "Offre réactivée");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      togglingFor = null;
    }
  }

  function formatDate(iso: string | Date | null | undefined): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  }

  function initial(name: string): string {
    return (name || "?").charAt(0).toUpperCase();
  }
</script>

<!-- Overlay -->
<div
  class="fixed inset-0 bg-black/40 z-40"
  onclick={onClose}
  role="button"
  tabindex="-1"
  onkeydown={(e) => e.key === "Escape" && onClose()}
></div>

<!-- Sheet panel -->
<div class="fixed right-0 top-0 h-full w-full max-w-2xl bg-background border-l border-border shadow-2xl z-50 flex flex-col overflow-hidden">
  <!-- Header -->
  <div class="flex items-start gap-4 px-6 py-5 border-b border-border bg-card shrink-0">
    <div class="shrink-0">
      {#if data?.meta.logoUrl}
        <img
          src="/api/image-proxy?url={encodeURIComponent(data.meta.logoUrl)}"
          alt={data.name}
          class="w-14 h-14 rounded-xl object-cover border border-border bg-white shrink-0"
        />
      {:else}
        <div class="w-14 h-14 rounded-xl bg-linear-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-xl">
          {initial(data?.name || companyName)}
        </div>
      {/if}
    </div>
    <div class="flex-1 min-w-0">
      <span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Entreprise</span>
      <h2 class="text-xl font-bold text-foreground leading-tight truncate">
        {data?.name || companyName}
      </h2>
      <div class="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
        {#if data?.meta.industry}
          <span class="inline-flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M10 21V10h4v11"/></svg>
            {data.meta.industry}
          </span>
        {/if}
        {#if data?.meta.headcount}
          <span class="inline-flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            {data.meta.headcount}
          </span>
        {/if}
        {#if data?.meta.location}
          <span class="inline-flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>
            {data.meta.location}
          </span>
        {/if}
        {#if data?.meta.website}
          <a
            href={data.meta.website.startsWith("http") ? data.meta.website : `https://${data.meta.website}`}
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 text-indigo-600 hover:underline"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            Site web
          </a>
        {/if}
      </div>
    </div>
    <button
      onclick={onClose}
      aria-label="Fermer"
      class="p-2 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground shrink-0"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-y-auto">
    {#if loading}
      <div class="flex items-center justify-center h-40 text-muted-foreground text-sm">
        <span class="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2"></span>
        Chargement…
      </div>
    {:else if !data}
      <div class="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm">
        <p>Aucune donnée disponible</p>
      </div>
    {:else}
      <!-- Stats -->
      <div class="grid grid-cols-4 gap-0 border-b border-border bg-muted/20">
        <div class="px-4 py-3 border-r border-border">
          <div class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Offres</div>
          <div class="text-lg font-semibold">
            {data.stats.activeOffers}
            {#if data.stats.totalOffers !== data.stats.activeOffers}
              <span class="text-sm font-normal text-muted-foreground">/ {data.stats.totalOffers}</span>
            {/if}
          </div>
        </div>
        <div class="px-4 py-3 border-r border-border">
          <div class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Contacts</div>
          <div class="text-lg font-semibold">{data.stats.totalContacts}</div>
        </div>
        <div class="px-4 py-3 border-r border-border">
          <div class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">LinkedIn</div>
          <div class="text-lg font-semibold">{data.stats.contactsWithLinkedin}</div>
        </div>
        <div class="px-4 py-3">
          <div class="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Dernier contact</div>
          <div class="text-sm font-semibold">
            {data.stats.lastContactAt ? formatDate(data.stats.lastContactAt) : "—"}
          </div>
        </div>
      </div>

      {#if data.meta.about}
        <div class="px-6 py-3 border-b border-border bg-card">
          <p class="text-sm text-foreground/80 leading-relaxed line-clamp-4">{data.meta.about}</p>
        </div>
      {/if}

      <!-- Offers -->
      <div class="px-6 py-4 space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-semibold">Offres ({data.offers.length})</h3>
          <span class="text-xs text-muted-foreground">Cliquez sur une offre pour l'ouvrir</span>
        </div>
        <div class="space-y-2">
          {#each data.offers as offer (offer.id)}
            {@const disabled = !!offer.disabledAt}
            {@const offerContacts = data.contacts.filter((c) => c.offerId === offer.id)}
            <div
              class="group border rounded-lg transition-colors flex items-start gap-3 px-4 py-3 {disabled ? 'bg-gray-50 border-gray-200 opacity-75' : 'border-border hover:border-indigo-200 hover:bg-indigo-50/40'} cursor-pointer"
              role="button"
              tabindex="0"
              onclick={() => onOfferClick?.(offer)}
              onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOfferClick?.(offer); } }}
            >
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-sm font-medium text-foreground truncate">
                    {offer.offerTitle || "(offre sans titre)"}
                  </span>
                  {#if disabled}
                    <span class="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 font-semibold">Désactivée</span>
                  {/if}
                </div>
                <div class="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                  <span class="truncate">{offer.listName}</span>
                  {#if offer.offerLocation}
                    <span>·</span>
                    <span>{offer.offerLocation}</span>
                  {/if}
                  <span>·</span>
                  <span>{offerContacts.length} contact{offerContacts.length !== 1 ? "s" : ""}</span>
                  <span>·</span>
                  <span>{formatDate(offer.createdAt)}</span>
                </div>
              </div>
              {#if offer.offerUrl}
                <a
                  href={offer.offerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onclick={(e) => e.stopPropagation()}
                  class="shrink-0 p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground"
                  title="Ouvrir l'URL de l'offre"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
              {/if}
              <button
                type="button"
                onclick={(e) => { e.stopPropagation(); toggleOfferDisabled(offer); }}
                disabled={togglingFor === offer.id}
                class="shrink-0 p-1.5 rounded hover:bg-accent transition-colors disabled:opacity-50 {disabled ? 'text-emerald-600' : 'text-muted-foreground'}"
                title={disabled ? "Réactiver l'offre" : "Désactiver l'offre"}
              >
                {#if togglingFor === offer.id}
                  <span class="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                {:else if disabled}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                {:else}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                {/if}
              </button>
            </div>
          {/each}
        </div>
      </div>

      <!-- Contacts -->
      {#if data.contacts.length > 0}
        <div class="px-6 py-4 border-t border-border space-y-3">
          <h3 class="text-sm font-semibold">Contacts ({data.contacts.length})</h3>
          <div class="space-y-1.5">
            {#each data.contacts as c (c.id)}
              <div class="flex items-center gap-3 py-1.5 border-b border-border/60 last:border-0">
                <div class="w-8 h-8 rounded-full bg-linear-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                  {initial(c.fullName || c.email || "?")}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-sm font-medium truncate">{c.fullName || c.email || c.linkedinUrl || "Contact"}</span>
                    {#if c.offerDisabled}
                      <span class="text-[10px] uppercase tracking-wide px-1 py-0.5 rounded bg-gray-200 text-gray-600">off</span>
                    {/if}
                  </div>
                  <div class="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    {#if c.jobTitle}<span class="truncate">{c.jobTitle}</span>{/if}
                    {#if c.offerTitle}<span>·</span><span class="truncate">{c.offerTitle}</span>{/if}
                  </div>
                </div>
                {#if c.linkedinUrl}
                  <a href={c.linkedinUrl} target="_blank" rel="noopener noreferrer" class="shrink-0 p-1 rounded hover:bg-accent" title="LinkedIn">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="#0a66c2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                  </a>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>
