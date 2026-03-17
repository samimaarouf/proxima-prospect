<script lang="ts">
  import { toast } from "svelte-sonner";

  type Offer = {
    id: string;
    companyName: string;
    offerTitle: string | null;
    offerUrl: string | null;
    offerLocation: string | null;
    offerContent: string | null;
  };

  type Contact = {
    id: string;
    offerId: string;
    linkedinUrl: string | null;
    phone1: string | null;
    phone2: string | null;
    email: string | null;
    fullName: string | null;
    jobTitle: string | null;
    linkedinData: unknown;
    linkedinSummary: string | null;
    aiMessage: string | null;
    contactStatus: string | null;
    lastAction: string | null;
    nextStep: string | null;
    notes: string | null;
    companyName: string;
    offerUrl: string | null;
  };

  let {
    offer,
    contacts,
    onClose,
    onContactUpdated,
    onOfferScraped,
    isLinkedInEnabled = false,
  }: {
    offer: Offer;
    contacts: Contact[];
    onClose: () => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onContactUpdated?: (updated: any) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onOfferScraped?: (updated: any) => void;
    isLinkedInEnabled?: boolean;
  } = $props();

  let deliveryChannel = $state<"linkedin" | "whatsapp" | "email">("linkedin");
  let messages = $state<Record<string, string>>({});
  let generatingFor = $state<string | null>(null);
  let generatingAll = $state(false);
  let savingFor = $state<string | null>(null);
  let scraping = $state(false);
  let enrichingFor = $state<string | null>(null);
  let enrichingAll = $state(false);
  let isSending = $state(false);
  let sendProgress = $state({ current: 0, total: 0, success: 0, failed: 0 });

  // Contacts that have a LinkedIn URL but haven't been enriched yet
  const unenrichedCount = $derived(
    contacts.filter((c) => c.linkedinUrl && !c.linkedinData).length
  );

  const linkedinCharLimit = 300;

  // Initialize messages from existing aiMessage
  $effect(() => {
    const init: Record<string, string> = {};
    for (const c of contacts) {
      if (c.aiMessage) init[c.id] = c.aiMessage;
    }
    messages = init;
  });

  function getProfilePicture(contact: Contact): string | null {
    const profile = (contact.linkedinData ?? null) as Record<string, unknown> | null;
    return (
      (profile?.profile_picture_url as string) ||
      (profile?.picture_url as string) ||
      (profile?.photo_url as string) ||
      null
    );
  }

  function getInitial(name: string): string {
    return name?.charAt(0).toUpperCase() || "?";
  }

  const statusLabels: Record<string, { label: string; color: string }> = {
    to_contact: { label: "À contacter", color: "#d1d5db" },
    contacted: { label: "Contacté", color: "#93c5fd" },
    contacted_linkedin: { label: "LinkedIn", color: "#0a66c2" },
    contacted_whatsapp: { label: "WhatsApp", color: "#25d366" },
    contacted_email: { label: "Email", color: "#2563eb" },
    replied: { label: "Répondu", color: "#16a34a" },
    closed: { label: "Fermé", color: "#ef4444" },
  };

  async function generateMessage(contactId: string) {
    generatingFor = contactId;
    try {
      const res = await fetch(`/api/contacts/${contactId}/generate-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: deliveryChannel }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Erreur");
      const updated = await res.json();
      messages = { ...messages, [contactId]: updated.aiMessage || "" };
      onContactUpdated?.({ ...contacts.find((c) => c.id === contactId)!, ...updated });
      toast.success("Message généré");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la génération");
    } finally {
      generatingFor = null;
    }
  }

  async function generateAllMessages() {
    generatingAll = true;
    let count = 0;
    for (const contact of contacts) {
      generatingFor = contact.id;
      try {
        const res = await fetch(`/api/contacts/${contact.id}/generate-message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel: deliveryChannel }),
        });
        if (res.ok) {
          const updated = await res.json();
          messages = { ...messages, [contact.id]: updated.aiMessage || "" };
          onContactUpdated?.({ ...contact, ...updated });
          count++;
        }
      } catch { /* continue */ }
      await delay(400);
    }
    generatingFor = null;
    generatingAll = false;
    toast.success(`${count} message(s) générés`);
  }

  async function saveMessage(contact: Contact) {
    const msg = messages[contact.id];
    if (msg === undefined) return;
    savingFor = contact.id;
    try {
      const res = await fetch(`/api/contacts/${contact.id}/update-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiMessage: msg }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      onContactUpdated?.({ ...contact, ...updated });
      toast.success("Message sauvegardé");
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      savingFor = null;
    }
  }

  async function scrapeOfferUrl() {
    scraping = true;
    try {
      const res = await fetch(`/api/offers/${offer.id}/scrape`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      // Update parent offer state
      onOfferScraped?.(data);
      toast.success("Titre et localisation extraits !");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible de scraper cette URL");
    } finally {
      scraping = false;
    }
  }

  async function enrichContact(contact: Contact) {
    if (!contact.linkedinUrl) return;
    enrichingFor = contact.id;
    try {
      const res = await fetch(`/api/contacts/${contact.id}/enrich-linkedin`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      onContactUpdated?.({ ...contact, ...data });
      toast.success(`Profil enrichi : ${data.fullName || contact.linkedinUrl}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'enrichissement");
    } finally {
      enrichingFor = null;
    }
  }

  async function enrichAllContacts() {
    const toEnrich = contacts.filter((c) => c.linkedinUrl && !c.linkedinData);
    if (!toEnrich.length) { toast.info("Tous les profils sont déjà enrichis"); return; }
    enrichingAll = true;
    let count = 0;
    for (const contact of toEnrich) {
      enrichingFor = contact.id;
      try {
        const res = await fetch(`/api/contacts/${contact.id}/enrich-linkedin`, { method: "POST" });
        if (res.ok) {
          const data = await res.json();
          onContactUpdated?.({ ...contact, ...data });
          count++;
        }
      } catch { /* continue */ }
      await delay(1000);
    }
    enrichingFor = null;
    enrichingAll = false;
    toast.success(`${count} profil(s) LinkedIn enrichi(s) !`);
  }

  async function sendAllMessages() {
    const toSend = contacts.filter((c) => messages[c.id] !== undefined && messages[c.id].trim());
    if (!toSend.length) return;

    isSending = true;
    sendProgress = { current: 0, total: toSend.length, success: 0, failed: 0 };

    for (const contact of toSend) {
      try {
        const res = await fetch(`/api/contacts/${contact.id}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel: deliveryChannel, message: messages[contact.id] }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Erreur");
        }
        const updated = await res.json();
        onContactUpdated?.({ ...contact, ...updated });
        sendProgress = { ...sendProgress, current: sendProgress.current + 1, success: sendProgress.success + 1 };
      } catch (e) {
        console.error(`Send failed for ${contact.fullName || contact.id}:`, e);
        sendProgress = { ...sendProgress, current: sendProgress.current + 1, failed: sendProgress.failed + 1 };
      }
      if (deliveryChannel === "whatsapp") await delay(3000 + Math.random() * 5000);
      else await delay(1000 + Math.random() * 2000);
    }

    isSending = false;
    if (sendProgress.failed === 0) {
      toast.success(`${sendProgress.success} message${sendProgress.success > 1 ? "s" : ""} envoyé${sendProgress.success > 1 ? "s" : ""} !`);
    } else {
      toast.warning(`${sendProgress.success} envoyé${sendProgress.success > 1 ? "s" : ""}, ${sendProgress.failed} échoué${sendProgress.failed > 1 ? "s" : ""}`);
    }
  }

  function delay(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  const contactsWithMessages = $derived(
    contacts.filter((c) => messages[c.id] !== undefined && messages[c.id].trim() !== "")
  );
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
  <div class="flex items-start justify-between px-6 py-5 border-b border-border bg-card flex-shrink-0">
    <div class="flex-1 min-w-0 space-y-1">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{offer.companyName}</span>
        {#if offer.offerLocation}
          <span class="flex items-center gap-1 text-xs text-muted-foreground">
            <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/>
            </svg>
            {offer.offerLocation}
          </span>
        {/if}
      </div>
      <h2 class="text-lg font-bold text-foreground leading-snug">
        {#if offer.offerUrl}
          <a
            href={offer.offerUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="hover:text-indigo-600 hover:underline transition-colors inline-flex items-center gap-1.5"
          >
            {offer.offerTitle || offer.offerUrl}
            <svg class="w-4 h-4 flex-shrink-0 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
            </svg>
          </a>
        {:else}
          {offer.offerTitle || offer.companyName}
        {/if}
      </h2>
      <div class="flex items-center gap-2 mt-1">
        <p class="text-sm text-muted-foreground">{contacts.length} contact{contacts.length !== 1 ? "s" : ""}</p>
        {#if offer.offerUrl}
          <button
            onclick={scrapeOfferUrl}
            disabled={scraping}
            class="inline-flex items-center gap-1.5 px-2 py-1 text-xs border border-input rounded-md hover:bg-accent disabled:opacity-50 transition-colors text-muted-foreground"
            title="Extraire le titre et la localisation depuis l'URL de l'offre"
          >
            {#if scraping}
              <span class="w-3 h-3 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></span>
              Extraction…
            {:else}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
              Scraper l'offre
            {/if}
          </button>
        {/if}
      </div>
    </div>
    <button
      onclick={onClose}
      aria-label="Fermer"
      class="ml-4 p-2 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground flex-shrink-0"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  </div>

  <!-- LinkedIn enrich bar (shown when some contacts need enriching) -->
  {#if unenrichedCount > 0}
    <div class="flex items-center gap-3 px-6 py-2.5 border-b border-blue-100 bg-blue-50 flex-shrink-0">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="#0a66c2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
      <p class="text-xs text-blue-700 flex-1">
        <span class="font-semibold">{unenrichedCount} profil{unenrichedCount > 1 ? "s" : ""}</span> non enrichi{unenrichedCount > 1 ? "s" : ""}
        {#if !isLinkedInEnabled}
          — <span class="italic">Connectez LinkedIn dans les paramètres pour enrichir</span>
        {/if}
      </p>
      {#if isLinkedInEnabled}
        <button
          onclick={enrichAllContacts}
          disabled={enrichingAll}
          class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#0a66c2] text-white rounded-md hover:bg-[#004182] disabled:opacity-50 transition-colors"
        >
          {#if enrichingAll}
            <span class="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            Enrichissement…
          {:else}
            Enrichir tous les profils
          {/if}
        </button>
      {/if}
    </div>
  {/if}

  <!-- Channel + generate all bar -->
  <div class="flex items-center gap-3 px-6 py-3 border-b border-border bg-muted/30 flex-shrink-0 flex-wrap">
    <!-- Channel toggle -->
    <div class="inline-flex border border-border rounded-full overflow-hidden text-xs">
      {#each [["linkedin", "LinkedIn"], ["whatsapp", "WhatsApp"], ["email", "Email"]] as [ch, label]}
        <button
          type="button"
          class="px-3 py-1.5 transition-colors {deliveryChannel === ch ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:bg-accent'}"
          onclick={() => (deliveryChannel = ch as typeof deliveryChannel)}
        >
          {label}
        </button>
      {/each}
    </div>

    <div class="flex-1"></div>

    <button
      onclick={generateAllMessages}
      disabled={generatingAll || contacts.length === 0}
      class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors"
    >
      {#if generatingAll}
        <span class="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
        Génération…
      {:else}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L13.09 8.26L19 6L14.74 10.91L21 12L14.74 13.09L19 18L13.09 15.74L12 22L10.91 15.74L5 18L9.26 13.09L3 12L9.26 10.91L5 6L10.91 8.26L12 2Z"/></svg>
        Générer tous les messages
      {/if}
    </button>
  </div>

  <!-- Contacts list -->
  <div class="flex-1 overflow-y-auto px-6 py-4 space-y-4">
    {#if contacts.length === 0}
      <div class="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm">
        <p>Aucun contact pour cette offre</p>
      </div>
    {:else}
      {#each contacts as contact (contact.id)}
        {@const pic = getProfilePicture(contact)}
        {@const name = contact.fullName || contact.email || contact.linkedinUrl || "Contact"}
        {@const status = statusLabels[contact.contactStatus || "to_contact"] || statusLabels.to_contact}
        {@const msg = messages[contact.id]}
        {@const isGenerating = generatingFor === contact.id}
        {@const isSaving = savingFor === contact.id}
        {@const isEnriching = enrichingFor === contact.id}
        {@const needsEnrich = !!contact.linkedinUrl && !contact.linkedinData}

        <div class="border border-border rounded-xl overflow-hidden">
          <!-- Contact header -->
          <div class="flex items-center gap-3 px-4 py-3 bg-muted/20">
            <!-- Avatar -->
            <div class="flex-shrink-0">
              {#if pic}
                <img
                  src="/api/image-proxy?url={encodeURIComponent(pic)}"
                  alt={name}
                  class="w-10 h-10 rounded-full object-cover border border-border"
                />
              {:else}
                <div class="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-semibold text-sm">
                  {getInitial(name)}
                </div>
              {/if}
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-medium text-sm text-foreground">{name}</span>
                <span
                  class="inline-block w-2 h-2 rounded-full flex-shrink-0"
                  style="background-color: {status.color}"
                  title={status.label}
                ></span>
              </div>
              {#if contact.jobTitle}
                <p class="text-xs text-muted-foreground truncate">{contact.jobTitle}</p>
              {/if}
            </div>

            <!-- Action buttons -->
            <div class="flex items-center gap-1.5 flex-shrink-0">
              {#if contact.linkedinUrl}
                <a
                  href={contact.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="p-1.5 rounded hover:bg-accent transition-colors"
                  title="Profil LinkedIn"
                  onclick={(e) => e.stopPropagation()}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#0a66c2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                </a>
              {/if}
              {#if needsEnrich && isLinkedInEnabled}
                <button
                  onclick={() => enrichContact(contact)}
                  disabled={isEnriching || enrichingAll}
                  class="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-blue-200 text-blue-600 rounded-md hover:bg-blue-50 disabled:opacity-50 transition-colors"
                  title="Enrichir le profil LinkedIn"
                >
                  {#if isEnriching}
                    <span class="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></span>
                  {:else}
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  {/if}
                  Enrichir
                </button>
              {/if}
              <button
                onclick={() => generateMessage(contact.id)}
                disabled={isGenerating || generatingAll}
                class="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-input rounded-md hover:bg-accent disabled:opacity-50 transition-colors"
                title="Générer un message IA"
              >
                {#if isGenerating}
                  <span class="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></span>
                {:else}
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="#6366f1"><path d="M12 2L13.09 8.26L19 6L14.74 10.91L21 12L14.74 13.09L19 18L13.09 15.74L12 22L10.91 15.74L5 18L9.26 13.09L3 12L9.26 10.91L5 6L10.91 8.26L12 2Z"/></svg>
                {/if}
                {msg !== undefined ? "Regénérer" : "Générer"}
              </button>
            </div>
          </div>

          <!-- Message zone -->
          <div class="px-4 py-3 space-y-2">
            {#if msg !== undefined}
              <textarea
                value={msg}
                oninput={(e) => { messages = { ...messages, [contact.id]: (e.target as HTMLTextAreaElement).value }; }}
                rows={5}
                maxlength={deliveryChannel === "linkedin" ? linkedinCharLimit : undefined}
                class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                placeholder="Le message apparaîtra ici…"
              ></textarea>
              <div class="flex items-center justify-between">
                {#if deliveryChannel === "linkedin"}
                  <span class="text-xs {msg.length > linkedinCharLimit ? 'text-red-600 font-medium' : 'text-muted-foreground'}">
                    {msg.length}/{linkedinCharLimit}
                  </span>
                {:else}
                  <span class="text-xs text-muted-foreground">{msg.length} caractères</span>
                {/if}
                <button
                  onclick={() => saveMessage(contact)}
                  disabled={isSaving}
                  class="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {isSaving ? "Sauvegarde…" : "Sauvegarder"}
                </button>
              </div>
            {:else}
              <p class="text-xs text-muted-foreground italic py-1">
                Cliquez sur "Générer" pour créer un message personnalisé pour ce contact.
              </p>
            {/if}
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <!-- Sticky footer -->
  <div class="flex-shrink-0 border-t border-border px-6 py-4 bg-white flex items-center justify-between gap-4">
    <div class="text-sm text-muted-foreground">
      {#if isSending}
        <span class="flex items-center gap-2">
          <span class="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></span>
          Envoi {sendProgress.current}/{sendProgress.total}…
        </span>
      {:else if contactsWithMessages.length > 0}
        <span class="text-green-700 font-medium">
          {contactsWithMessages.length} message{contactsWithMessages.length > 1 ? "s" : ""} prêt{contactsWithMessages.length > 1 ? "s" : ""}
        </span>
      {:else}
        <span>Générez des messages pour pouvoir envoyer</span>
      {/if}
    </div>
    <button
      onclick={sendAllMessages}
      disabled={isSending || contactsWithMessages.length === 0}
      class="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
    >
      {#if isSending}
        <span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
        Envoi en cours…
      {:else}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
        {#if contactsWithMessages.length > 0}
          Envoyer à {contactsWithMessages.length} contact{contactsWithMessages.length > 1 ? "s" : ""}
        {:else}
          Envoyer
        {/if}
      {/if}
    </button>
  </div>
</div>
