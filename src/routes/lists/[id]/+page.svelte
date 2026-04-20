<script lang="ts">
  import { toast } from "svelte-sonner";
  import AgGrid from "$lib/components/custom/AgGrid/AgGrid.svelte";
  import OfferSheet from "$lib/components/OfferSheet.svelte";
  import type { PageData } from "./$types";
  import type {
    GridOptions,
    ColDef,
    ICellRendererParams,
    FirstDataRenderedEvent,
    RowClickedEvent,
  } from "@ag-grid-community/core";

  let { data }: { data: PageData } = $props();

  type Offer = (typeof data.offers)[0];
  type Contact = (typeof data.contacts)[0];

  let list = $state(data.list as typeof data.list);
  let offers = $state([...data.offers]);
  let contacts = $state([...data.contacts]);
  let contactsByOffer = $state({ ...data.contactsByOffer });

  // UI state
  let showImportDialog = $state(false);
  let selectedOfferForSheet = $state<Offer | null>(null);
  let showOfferSheet = $state(false);
  let importFile = $state<File | null>(null);
  let importing = $state(false);
  let autoEnriching = $state(false);
  let autoEnrichProgress = $state({ current: 0, total: 0 });
  let autoScraping = $state(false);
  let autoScrapeProgress = $state({ current: 0, total: 0 });
  let quickFilter = $state("");
  let editingListName = $state(false);
  let listNameDraft = $state(list.name);

  function focusOnMount(node: HTMLElement) {
    node.focus();
    if (node instanceof HTMLInputElement) node.select();
  }

  const isLinkedInEnabled = $derived(!!data.userProfile?.unipileLinkedInAccountId);
  const isFullenrichEnabled = $derived(!!data.userProfile?.fullenrichApiKey);

  // Derived: offers enriched with contact count
  const offersWithCount = $derived(
    offers.map((o) => ({
      ...o,
      contactCount: (contactsByOffer[o.id] || []).length,
    }))
  );

  // Contacts for selected offer
  const selectedOfferContacts = $derived(
    selectedOfferForSheet ? (contactsByOffer[selectedOfferForSheet.id] || []) : []
  );

  // ===========================
  // AG-Grid column definitions
  // ===========================
  function getColumnDefs(): ColDef[] {
    return [
      {
        field: "companyName",
        headerName: "Entreprise",
        width: 200,
        pinned: "left",
        cellRenderer: (params: ICellRendererParams) => {
          const name = params.value as string;
          const div = document.createElement("div");
          div.style.display = "flex";
          div.style.alignItems = "center";
          div.style.height = "100%";
          div.style.gap = "10px";

          const avatar = document.createElement("div");
          avatar.style.width = "32px";
          avatar.style.height = "32px";
          avatar.style.borderRadius = "8px";
          avatar.style.background = "linear-gradient(135deg, #6366f1, #8b5cf6)";
          avatar.style.display = "flex";
          avatar.style.alignItems = "center";
          avatar.style.justifyContent = "center";
          avatar.style.color = "white";
          avatar.style.fontWeight = "700";
          avatar.style.fontSize = "0.8rem";
          avatar.style.flexShrink = "0";
          avatar.textContent = (name || "?")[0].toUpperCase();
          div.appendChild(avatar);

          const nameEl = document.createElement("span");
          nameEl.style.fontWeight = "600";
          nameEl.style.fontSize = "0.875rem";
          nameEl.textContent = name || "—";
          div.appendChild(nameEl);

          return div;
        },
      },
      {
        field: "offerTitle",
        headerName: "Intitulé du poste",
        flex: 1,
        minWidth: 200,
        cellRenderer: (params: ICellRendererParams) => {
          const title = params.value as string | null;
          const offerUrl = params.data?.offerUrl as string | null;

          if (!title && !offerUrl) {
            const span = document.createElement("span");
            span.style.color = "#9ca3af";
            span.style.fontStyle = "italic";
            span.style.fontSize = "0.8125rem";
            span.textContent = "—";
            return span;
          }

          if (offerUrl) {
            const link = document.createElement("a");
            link.href = offerUrl;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.onclick = (e) => e.stopPropagation();
            link.style.display = "inline-flex";
            link.style.alignItems = "center";
            link.style.gap = "5px";
            link.style.color = "#4f46e5";
            link.style.fontWeight = "500";
            link.style.fontSize = "0.875rem";
            link.style.textDecoration = "none";
            link.style.maxWidth = "100%";
            link.style.overflow = "hidden";
            link.style.textOverflow = "ellipsis";
            link.style.whiteSpace = "nowrap";

            const textSpan = document.createElement("span");
            textSpan.textContent = title || offerUrl;
            textSpan.style.overflow = "hidden";
            textSpan.style.textOverflow = "ellipsis";
            textSpan.style.whiteSpace = "nowrap";
            link.appendChild(textSpan);

            const icon = document.createElement("span");
            icon.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:0.6"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>`;
            link.appendChild(icon);

            link.addEventListener("mouseenter", () => { link.style.textDecoration = "underline"; });
            link.addEventListener("mouseleave", () => { link.style.textDecoration = "none"; });

            return link;
          }

          const span = document.createElement("span");
          span.style.fontWeight = "500";
          span.style.fontSize = "0.875rem";
          span.textContent = title || "—";
          return span;
        },
      },
      {
        field: "offerLocation",
        headerName: "Localisation",
        width: 160,
        cellRenderer: (params: ICellRendererParams) => {
          const loc = params.value as string | null;
          if (!loc) {
            const span = document.createElement("span");
            span.style.color = "#9ca3af";
            span.style.fontSize = "0.8125rem";
            span.textContent = "—";
            return span;
          }
          const div = document.createElement("div");
          div.style.display = "flex";
          div.style.alignItems = "center";
          div.style.gap = "5px";
          div.innerHTML = `<svg width="13" height="13" viewBox="0 0 20 20" fill="#6b7280"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>`;
          const span = document.createElement("span");
          span.style.fontSize = "0.8125rem";
          span.style.color = "#374151";
          span.textContent = loc;
          div.appendChild(span);
          return div;
        },
      },
      {
        field: "contactCount",
        headerName: "Contacts",
        width: 100,
        sortable: true,
        filter: false,
        resizable: false,
        cellRenderer: (params: ICellRendererParams) => {
          const count = params.value as number;
          const span = document.createElement("span");
          span.style.display = "inline-flex";
          span.style.alignItems = "center";
          span.style.justifyContent = "center";
          span.style.width = "28px";
          span.style.height = "20px";
          span.style.borderRadius = "9999px";
          span.style.background = count > 0 ? "#ede9fe" : "#f3f4f6";
          span.style.color = count > 0 ? "#6d28d9" : "#6b7280";
          span.style.fontSize = "0.75rem";
          span.style.fontWeight = "600";
          span.textContent = String(count);
          return span;
        },
      },
      {
        headerName: "",
        width: 52,
        sortable: false,
        filter: false,
        resizable: false,
        suppressMovable: true,
        cellRenderer: (params: ICellRendererParams) => {
          const offerUrl = params.data?.offerUrl as string | null;
          if (!offerUrl) return "";

          const btn = document.createElement("button");
          btn.title = "Re-scraper l'URL pour extraire titre et localisation";
          btn.style.cssText = "display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:6px;border:1px solid #e5e7eb;background:transparent;cursor:pointer;transition:background 0.15s;";
          btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`;
          btn.addEventListener("mouseenter", () => { btn.style.background = "#f3f4f6"; });
          btn.addEventListener("mouseleave", () => { btn.style.background = "transparent"; });
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            handleScrapeRow(params.data?.id);
          });
          return btn;
        },
      },
      {
        headerName: "",
        width: 48,
        sortable: false,
        filter: false,
        resizable: false,
        suppressMovable: true,
        cellRenderer: (params: ICellRendererParams) => {
          const btn = document.createElement("button");
          btn.title = "Supprimer l'offre";
          btn.style.cssText = "display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:6px;border:1px solid #fee2e2;background:transparent;cursor:pointer;transition:background 0.15s;";
          btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
          btn.addEventListener("mouseenter", () => { btn.style.background = "#fef2f2"; });
          btn.addEventListener("mouseleave", () => { btn.style.background = "transparent"; });
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            handleDeleteOffer(params.data?.id);
          });
          return btn;
        },
      },
    ];
  }

  let scrapingOfferId = $state<string | null>(null);

  async function handleRenameList() {
    const trimmed = listNameDraft.trim();
    if (!trimmed || trimmed === list.name) { editingListName = false; return; }
    try {
      const res = await fetch(`/api/lists/${list.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) throw new Error("Erreur lors du renommage");
      list = { ...list, name: trimmed };
      editingListName = false;
      toast.success("Liste renommée !");
    } catch {
      toast.error("Impossible de renommer la liste");
    }
  }

  let showDeleteOfferDialog = $state(false);
  let offerToDelete = $state<{ id: string; companyName: string } | null>(null);
  let isDeletingOffer = $state(false);

  function handleDeleteOffer(offerId: string) {
    const offer = offers.find((o) => o.id === offerId);
    if (!offer) return;
    offerToDelete = { id: offerId, companyName: offer.companyName };
    showDeleteOfferDialog = true;
  }

  async function confirmDeleteOffer() {
    if (!offerToDelete) return;
    isDeletingOffer = true;
    try {
      const res = await fetch(`/api/offers/${offerToDelete.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erreur lors de la suppression");
      const deletedId = offerToDelete.id;
      offers = offers.filter((o) => o.id !== deletedId);
      contacts = contacts.filter((c) => c.offerId !== deletedId);
      const updated = { ...contactsByOffer };
      delete updated[deletedId];
      contactsByOffer = updated;
      if (selectedOfferForSheet?.id === deletedId) showOfferSheet = false;
      showDeleteOfferDialog = false;
      offerToDelete = null;
      toast.success("Offre supprimée");
    } catch {
      toast.error("Impossible de supprimer l'offre");
    } finally {
      isDeletingOffer = false;
    }
  }

  async function handleScrapeRow(offerId: string) {
    if (!offerId || scrapingOfferId) return;
    scrapingOfferId = offerId;
    try {
      const result = await scrapeOffer(offerId);
      if (result) {
        updateOffer(result);
        toast.success("Titre et localisation extraits !");
      } else {
        toast.error("Impossible d'extraire les informations depuis cette URL");
      }
    } catch {
      toast.error("Erreur lors du scraping");
    } finally {
      scrapingOfferId = null;
    }
  }

  const gridOptions: GridOptions = {
    defaultColDef: { resizable: true, sortable: true, filter: true },
    columnDefs: getColumnDefs(),
    rowHeight: 52,
    rowClass: "cursor-pointer",
    rowClassRules: {
      "offer-row-yellow": (params) => !!params.data?.hasOtherOffer,
    },
    onRowClicked: handleRowClicked,
  };

  function handleRowClicked(event: RowClickedEvent) {
    const target = event.event?.target as HTMLElement;
    if (target?.closest("a")) return;
    const offer = offers.find((o) => o.id === event.data?.id);
    if (offer) {
      selectedOfferForSheet = offer;
      showOfferSheet = true;
    }
  }

  // ===========================
  // Import + auto-enrich + auto-scrape
  // ===========================
  const isCsvFile = $derived(importFile ? importFile.name.toLowerCase().endsWith(".csv") : false);
  // "contacts" = CSV export format (Nom;Prénom;LinkedIn…), "calibre" = one row per offer, null = xlsx
  let csvFormat = $state<"contacts" | "calibre" | null>(null);

  async function handleImport() {
    if (!importFile) { toast.error("Sélectionnez un fichier"); return; }
    importing = true;
    const formData = new FormData();
    formData.append("file", importFile);
    try {
      let endpoint: string;
      let successMsg: string;
      if (csvFormat === "contacts") {
        endpoint = `/api/lists/${list.id}/import-contacts`;
      } else if (isCsvFile) {
        endpoint = `/api/lists/${list.id}/import-csv`;
      } else {
        endpoint = `/api/lists/${list.id}/import`;
      }
      const res = await fetch(endpoint, { method: "POST", body: formData });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Erreur");
      const result = await res.json();
      if (csvFormat === "contacts") {
        successMsg = `Import terminé : ${result.updated} contact(s) mis à jour${result.notFound > 0 ? `, ${result.notFound} non trouvé(s)` : ""}`;
      } else if (isCsvFile) {
        successMsg = `Import CSV terminé : ${result.imported} offre(s) importée(s)${result.duplicates > 0 ? `, ${result.duplicates} doublon(s) ignoré(s)` : ""}`;
      } else {
        successMsg = `Import terminé : ${result.contactsCreated} contacts, ${result.offersCreated} offre(s)${result.offersSkipped > 0 ? `, ${result.offersSkipped} offre(s) déjà existante(s) ignorée(s)` : ""}`;
      }
      toast.success(successMsg);

      // Reload data
      const listData = await (await fetch(`/api/lists/${list.id}`)).json();
      contacts = listData.contacts;
      offers = listData.offers || offers;
      const newCBO: Record<string, Contact[]> = {};
      for (const c of listData.contacts) {
        if (!newCBO[c.offerId]) newCBO[c.offerId] = [];
        newCBO[c.offerId].push(c);
      }
      contactsByOffer = newCBO;

      showImportDialog = false;
      importFile = null;
      csvFormat = null;

      // Auto-scrape offers that have a URL but no title
      const toScrape = (listData.offers || offers).filter(
        (o: Offer) => o.offerUrl && !o.offerTitle
      );
      if (toScrape.length > 0) {
        autoScraping = true;
        autoScrapeProgress = { current: 0, total: toScrape.length };
        toast.info(`Récupération du titre/localisation pour ${toScrape.length} offre(s)…`);
        for (const offer of toScrape) {
          try {
            const scraped = await scrapeOffer(offer.id);
            if (scraped) updateOffer(scraped);
          } catch { /* continue */ }
          autoScrapeProgress = { ...autoScrapeProgress, current: autoScrapeProgress.current + 1 };
          await delay(600);
        }
        autoScraping = false;
        toast.success("Extraction des offres terminée !");
      }

      // Auto-enrich new LinkedIn profiles (only if LinkedIn is connected)
      const toEnrich = listData.contacts.filter((c: Contact) => c.linkedinUrl && !c.linkedinData);
      if (toEnrich.length > 0 && isLinkedInEnabled) {
        autoEnriching = true;
        autoEnrichProgress = { current: 0, total: toEnrich.length };
        toast.info(`Enrichissement de ${toEnrich.length} profil(s) LinkedIn…`);
        for (const contact of toEnrich) {
          try {
            const enrichRes = await fetch(`/api/contacts/${contact.id}/enrich-linkedin`, { method: "POST" });
            if (enrichRes.ok) {
              const updated = await enrichRes.json();
              updateContact(updated);
            }
          } catch { /* continue */ }
          autoEnrichProgress = { ...autoEnrichProgress, current: autoEnrichProgress.current + 1 };
          await delay(800);
        }
        autoEnriching = false;
        toast.success("Enrichissement LinkedIn terminé !");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'import");
    } finally { importing = false; }
  }

  // ===========================
  // Scrape offer URL
  // ===========================
  async function scrapeOffer(offerId: string): Promise<Offer | null> {
    const res = await fetch(`/api/offers/${offerId}/scrape`, { method: "POST" });
    if (!res.ok) return null;
    return await res.json();
  }

  // ===========================
  // Helpers
  // ===========================
  function updateOffer(updated: Partial<Offer> & { id: string }) {
    offers = offers.map((o) => o.id === updated.id ? { ...o, ...updated } : o);
    if (selectedOfferForSheet?.id === updated.id) {
      selectedOfferForSheet = { ...selectedOfferForSheet, ...updated };
    }
  }

  function updateContact(updated: Partial<Contact> & { id: string }) {
    const exists = contacts.some((c) => c.id === updated.id);
    if (exists) {
      contacts = contacts.map((c) => c.id === updated.id ? { ...c, ...updated } : c);
    } else {
      contacts = [...contacts, updated as Contact];
    }
    const offerId = updated.offerId || contacts.find((c) => c.id === updated.id)?.offerId;
    if (offerId) {
      const inOffer = (contactsByOffer[offerId] || []).some((c) => c.id === updated.id);
      contactsByOffer = {
        ...contactsByOffer,
        [offerId]: inOffer
          ? (contactsByOffer[offerId] || []).map((c) => c.id === updated.id ? { ...c, ...updated } : c)
          : [...(contactsByOffer[offerId] || []), updated as Contact],
      };
    }
  }

  function handleContactUpdated(updated: Contact) {
    updateContact(updated);
  }

  function handleContactDeleted(contactId: string) {
    const offerId = contacts.find((c) => c.id === contactId)?.offerId;
    contacts = contacts.filter((c) => c.id !== contactId);
    if (offerId) {
      contactsByOffer = {
        ...contactsByOffer,
        [offerId]: (contactsByOffer[offerId] || []).filter((c) => c.id !== contactId),
      };
    }
  }

  async function handleFileInput(e: Event) {
    importFile = (e.target as HTMLInputElement).files?.[0] || null;
    csvFormat = null;
    if (!importFile) return;
    const name = importFile.name.toLowerCase();
    if (name.endsWith(".csv")) {
      // Read first line to detect format
      const slice = await importFile.slice(0, 200).text();
      const firstLine = slice.replace(/\uFEFF/, "").split(/\r?\n/)[0] ?? "";
      // Contact CSV: either our export format (Nom + LinkedIn) or candidate_* format
      if (
        (firstLine.includes("Nom") && firstLine.includes("LinkedIn")) ||
        firstLine.includes("candidate_")
      ) {
        csvFormat = "contacts";
      } else {
        csvFormat = "calibre";
      }
    }
    // For xlsx: csvFormat stays null → user picks via radio buttons in the dialog
  }

  function handleExport() {
    window.location.href = `/api/lists/${list.id}/export`;
  }


  function delay(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // Grid height state
  let gridHeight = $state(500);
  let isResizing = $state(false);
  let resizeStartY = $state(0);
  let resizeStartH = $state(0);

  function startResize(e: MouseEvent) {
    isResizing = true;
    resizeStartY = e.clientY;
    resizeStartH = gridHeight;
    window.addEventListener("mousemove", onResize);
    window.addEventListener("mouseup", stopResize);
  }

  function onResize(e: MouseEvent) {
    if (!isResizing) return;
    gridHeight = Math.max(200, Math.min(900, resizeStartH + (e.clientY - resizeStartY)));
  }

  function stopResize() {
    isResizing = false;
    window.removeEventListener("mousemove", onResize);
    window.removeEventListener("mouseup", stopResize);
  }

  const totalContacts = $derived(contacts.length);
</script>

<div class="main-layout">
  <!-- Header -->
  <div class="header-bar">
    <div class="flex items-center gap-3 min-w-0">
      <a href="/" class="text-muted-foreground hover:text-foreground text-sm flex-shrink-0">← Accueil</a>
      <span class="text-muted-foreground">/</span>
      {#if editingListName}
        <input
          class="text-base font-semibold border-b border-foreground bg-transparent outline-none min-w-0 w-48"
          bind:value={listNameDraft}
          onblur={handleRenameList}
          onkeydown={(e) => { if (e.key === 'Enter') handleRenameList(); if (e.key === 'Escape') { listNameDraft = list.name; editingListName = false; } }}
          use:focusOnMount
        />
      {:else}
        <button
          type="button"
          class="text-base font-semibold truncate cursor-pointer hover:underline decoration-dotted bg-transparent border-none p-0"
          title="Cliquer pour renommer"
          onclick={() => { listNameDraft = list.name; editingListName = true; }}
        >{list.name}</button>
      {/if}
      {#if autoScraping}
        <span class="text-xs text-violet-600 flex items-center gap-1.5">
          <span class="w-3 h-3 border-2 border-violet-600 border-t-transparent rounded-full animate-spin"></span>
          Scraping offres {autoScrapeProgress.current}/{autoScrapeProgress.total}
        </span>
      {:else if autoEnriching}
        <span class="text-xs text-indigo-600 flex items-center gap-1.5">
          <span class="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
          Enrichissement {autoEnrichProgress.current}/{autoEnrichProgress.total}
        </span>
      {/if}
    </div>
    <div class="flex items-center gap-3 flex-shrink-0">
      <span class="text-sm text-muted-foreground">
        {offers.length} offre{offers.length !== 1 ? "s" : ""} · {totalContacts} contact{totalContacts !== 1 ? "s" : ""}
      </span>
      <button
        onclick={handleExport}
        class="inline-flex items-center gap-1.5 px-3 py-1.5 border border-input rounded-md text-sm hover:bg-accent transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        Exporter CSV
      </button>
      <button
        onclick={() => (showImportDialog = true)}
        class="inline-flex items-center gap-1.5 px-3 py-1.5 border border-input rounded-md text-sm hover:bg-accent transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Importer
      </button>
    </div>
  </div>

  {#if list.pitch}
    <div class="px-6 py-2 bg-indigo-50 border-b border-indigo-100">
      <p class="text-sm text-indigo-700"><span class="font-medium">Pitch :</span> {list.pitch}</p>
    </div>
  {/if}

  <!-- Toolbar -->
  <div class="toolbar-bar">
    <input
      type="text"
      bind:value={quickFilter}
      placeholder="Rechercher une offre ou entreprise…"
      class="px-3 py-1.5 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring w-64"
    />
    <span class="text-xs text-muted-foreground">
      Cliquez sur une ligne pour voir les contacts et générer les messages
    </span>
  </div>

  <!-- Grid -->
  {#if offers.length === 0}
    <div class="flex flex-col items-center justify-center h-64 text-muted-foreground px-6">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="mb-4 opacity-30"><path d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>
      <p class="text-base font-medium mb-2">Aucune offre</p>
      <p class="text-sm mb-4">Importez un fichier Excel ou CSV pour commencer</p>
      <button
        onclick={() => (showImportDialog = true)}
        class="px-5 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg shadow-md text-sm font-medium transition-colors"
      >
        Importer
      </button>
    </div>
  {:else}
    <div class="grid-container" style="height: {gridHeight}px;">
      <AgGrid
        rowData={offersWithCount}
        {gridOptions}
        quickFilterText={quickFilter}
        gridStyle="height: 100%;"
      />
      <button
        class="resize-handle"
        type="button"
        onmousedown={startResize}
        aria-label="Redimensionner la grille"
      ></button>
    </div>
  {/if}
</div>

<!-- Offer Sheet (side panel) -->
{#if showOfferSheet && selectedOfferForSheet}
  <OfferSheet
    offer={selectedOfferForSheet as any}
    contacts={selectedOfferContacts as any}
    onClose={() => (showOfferSheet = false)}
    onContactUpdated={handleContactUpdated}
    onContactDeleted={handleContactDeleted}
    onOfferScraped={(updated) => { updateOffer(updated); selectedOfferForSheet = { ...selectedOfferForSheet!, ...updated }; }}
    onOfferDeleted={handleDeleteOffer}
    {isLinkedInEnabled}
    fullenrichEnabled={isFullenrichEnabled}
  />
{/if}

<!-- Import dialog -->
{#if showImportDialog}
  <div
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    onclick={(e) => { if (e.target === e.currentTarget) { showImportDialog = false; importFile = null; csvFormat = null; } }}
    onkeydown={(e) => { if (e.key === "Escape") { showImportDialog = false; importFile = null; csvFormat = null; } }}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="bg-white border border-border rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
      <h3 class="text-lg font-semibold">Importer</h3>

      {#if !importFile}
        <p class="text-sm text-muted-foreground">
          Sélectionnez un fichier <strong>.csv</strong> (export contacts ou calibre) ou <strong>.xlsx</strong> (format Excel).
        </p>
      {:else if csvFormat === "contacts"}
        <div class="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg p-3 space-y-1">
          <p class="font-medium">Format contacts détecté</p>
          <p class="text-xs text-green-600">Met à jour les contacts existants via LinkedIn. Supporte le format export (Nom, LinkedIn, Email…) et le format <code>candidate_*</code> (candidate__name, candidate__linkedin, candidate__email_1…).</p>
        </div>
      {:else if csvFormat === "calibre"}
        <div class="text-sm text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg p-3 space-y-1">
          <p class="font-medium">Format CSV calibre détecté</p>
          <p class="text-xs text-indigo-600">Une ligne = une offre + un décisionnaire (CEO/Fondateur). L'enrichissement LinkedIn se lancera automatiquement.</p>
        </div>
      {:else if importFile}
        <!-- Excel: let user choose the format -->
        <div class="space-y-2">
          <p class="text-sm font-medium text-gray-700">Quel est le format de ce fichier ?</p>
          <label class="flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors {csvFormat === null ? 'border-indigo-300 bg-indigo-50/40' : 'border-gray-200 hover:border-gray-300'}">
            <input type="radio" name="xlsxFormat" class="mt-0.5" checked={csvFormat === null} onchange={() => (csvFormat = null)} />
            <div>
              <p class="text-sm font-medium text-indigo-800">Calibre (créer des offres)</p>
              <p class="text-xs text-indigo-600">Colonnes : Entreprise | Intitulé | URL | Localisation | LinkedIn | Tél | Email…</p>
            </div>
          </label>
          <label class="flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors {csvFormat === 'contacts' ? 'border-green-300 bg-green-50/40' : 'border-gray-200 hover:border-gray-300'}">
            <input type="radio" name="xlsxFormat" class="mt-0.5" checked={csvFormat === "contacts"} onchange={() => (csvFormat = "contacts")} />
            <div>
              <p class="text-sm font-medium text-green-800">Contacts (mettre à jour)</p>
              <p class="text-xs text-green-600">Colonnes : <code>candidate__name</code>, <code>candidate__linkedin</code>, <code>candidate__email_1</code>, <code>candidate__phone_1</code>…</p>
            </div>
          </label>
        </div>
      {/if}

      <div
        class="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors {importFile ? 'border-indigo-300 bg-indigo-50/30' : 'border-gray-200 hover:border-indigo-400'}"
        onclick={() => document.getElementById("file-input")?.click()}
        role="button"
        tabindex="0"
        onkeydown={(e) => e.key === "Enter" && document.getElementById("file-input")?.click()}
      >
        <input id="file-input" type="file" accept=".xlsx,.xls,.csv" class="hidden" onchange={handleFileInput} />
        {#if importFile}
          <p class="font-medium text-sm">📄 {importFile.name}</p>
          <p class="text-muted-foreground text-xs mt-1">{(importFile.size / 1024).toFixed(1)} KB · <span class="text-indigo-500 underline">Changer</span></p>
        {:else}
          <svg class="mx-auto mb-2 text-gray-300" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <p class="text-muted-foreground text-sm">Cliquez pour sélectionner</p>
          <p class="text-muted-foreground text-xs mt-1">.csv ou .xlsx</p>
        {/if}
      </div>

      <div class="flex gap-3 justify-end">
        <button
          onclick={() => { showImportDialog = false; importFile = null; csvFormat = null; }}
          class="px-4 py-2 text-sm border border-input rounded-md hover:bg-accent transition-colors"
        >
          Annuler
        </button>
        <button
          onclick={handleImport}
          disabled={!importFile || importing}
          class="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          {importing ? "Import en cours…" : "Importer"}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Delete offer confirmation dialog -->
{#if showDeleteOfferDialog && offerToDelete}
  <div
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    onclick={(e) => { if (e.target === e.currentTarget && !isDeletingOffer) showDeleteOfferDialog = false; }}
    onkeydown={(e) => { if (e.key === "Escape" && !isDeletingOffer) showDeleteOfferDialog = false; }}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="bg-white border border-border rounded-xl shadow-xl w-full max-w-sm p-6 space-y-5">
      <!-- Icon + title -->
      <div class="flex items-start gap-4">
        <div class="flex-shrink-0 w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </div>
        <div class="min-w-0">
          <h3 class="text-base font-semibold text-gray-900">Supprimer l'offre</h3>
          <p class="text-sm text-muted-foreground mt-1">
            Vous êtes sur le point de supprimer <span class="font-medium text-gray-700">{offerToDelete.companyName}</span> et tous ses contacts associés.
          </p>
          <p class="text-xs text-red-500 mt-2 font-medium">Cette action est irréversible.</p>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex gap-3 justify-end pt-1">
        <button
          onclick={() => { showDeleteOfferDialog = false; offerToDelete = null; }}
          disabled={isDeletingOffer}
          class="px-4 py-2 text-sm border border-input rounded-md hover:bg-accent transition-colors disabled:opacity-50"
        >
          Annuler
        </button>
        <button
          onclick={confirmDeleteOffer}
          disabled={isDeletingOffer}
          class="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {#if isDeletingOffer}
            <span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            Suppression…
          {:else}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
            Supprimer
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .main-layout {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    background: white;
  }

  .header-bar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.875rem 1.5rem;
    border-bottom: 1px solid #e5e7eb;
    background: white;
  }

  .toolbar-bar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 1.5rem;
    border-bottom: 1px solid #e5e7eb;
    background: #f9fafb;
    min-height: 48px;
  }

  .grid-container {
    flex-shrink: 0;
    position: relative;
    overflow: hidden;
  }

  .resize-handle {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 8px;
    cursor: ns-resize;
    border: none;
    padding: 0;
    background: transparent;
    z-index: 10;
    transition: background-color 0.2s;
  }

  .resize-handle:hover {
    background: rgba(99, 102, 241, 0.15);
  }

  .resize-handle::after {
    content: '';
    position: absolute;
    bottom: 3px;
    left: 50%;
    transform: translateX(-50%);
    width: 40px;
    height: 2px;
    background: #9ca3af;
    border-radius: 1px;
    transition: background-color 0.2s;
  }

  .resize-handle:hover::after {
    background: #6366f1;
  }

  :global(.ag-row) {
    cursor: pointer;
  }

  :global(.ag-row:hover) {
    background-color: #f5f3ff !important;
  }

  :global(.ag-row.offer-row-yellow),
  :global(.ag-row.offer-row-yellow .ag-cell) {
    background-color: #fef9c3 !important;
  }

  :global(.ag-row.offer-row-yellow.ag-row-hover),
  :global(.ag-row.offer-row-yellow.ag-row-hover .ag-cell) {
    background-color: #fef08a !important;
  }
</style>
