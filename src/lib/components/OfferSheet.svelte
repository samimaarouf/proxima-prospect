<script lang="ts">
  import { toast } from "svelte-sonner";

  type DuplicateOffer = {
    id: string;
    listId: string;
    listName: string;
    offerTitle: string | null;
    offerUrl: string | null;
    companyName: string;
  };

  type Offer = {
    id: string;
    companyName: string;
    offerTitle: string | null;
    offerUrl: string | null;
    offerLocation: string | null;
    offerContent: string | null;
    disabledAt?: string | Date | null;
    duplicateOffers?: DuplicateOffer[];
  };

  type Contact = {
    id: string;
    offerId: string;
    linkedinUrl: string | null;
    phone1: string | null;
    phone2: string | null;
    email: string | null;
    email2: string | null;
    fullName: string | null;
    jobTitle: string | null;
    linkedinData: unknown;
    linkedinSummary: string | null;
    aiMessage: string | null;
    aiMessageLinkedin: string | null;
    contactStatus: string | null;
    lastAction: string | null;
    nextStep: string | null;
    notes: string | null;
    companyName: string;
    offerUrl: string | null;
    updatedAt?: string | null;
  };

  let {
    offer,
    contacts,
    onClose,
    onContactUpdated,
    onContactDeleted,
    onOfferScraped,
    onOfferDeleted,
    onOfferUpdated,
    isLinkedInEnabled = false,
    fullenrichEnabled = false,
  }: {
    offer: Offer;
    contacts: Contact[];
    onClose: () => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onContactUpdated?: (updated: any) => void;
    onContactDeleted?: (contactId: string) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onOfferScraped?: (updated: any) => void;
    onOfferDeleted?: (offerId: string) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onOfferUpdated?: (updated: any) => void;
    isLinkedInEnabled?: boolean;
    fullenrichEnabled?: boolean;
  } = $props();

  let isDisabled = $derived(!!offer.disabledAt);
  let togglingDisabled = $state(false);

  async function toggleDisabled() {
    togglingDisabled = true;
    try {
      const res = await fetch(`/api/offers/${offer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: !isDisabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      onOfferUpdated?.(data);
      toast.success(data.disabledAt ? "Offre désactivée" : "Offre réactivée");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      togglingDisabled = false;
    }
  }

  type HistoryEntry = {
    id: string;
    channel: string;
    recipient: string | null;
    message: string;
    offerTitle: string | null;
    companyName: string | null;
    sentAt: string;
  };

  let deliveryChannel = $state<"linkedin" | "whatsapp" | "email">("linkedin");
  /** WhatsApp + email : même corps (stocké dans contact.aiMessage avec éventuellement Objet:) */
  let longMessages = $state<Record<string, string>>({});
  let linkedinMessages = $state<Record<string, string>>({});
  /** Mode aperçu (rendu HTML) par contact */
  let previewOpen = $state<Record<string, boolean>>({});
  let generatingFor = $state<string | null>(null);
  let generatingAll = $state(false);
  let savingFor = $state<string | null>(null);
  let scraping = $state(false);
  let enrichingFor = $state<string | null>(null);
  let enrichingAll = $state(false);
  let enrichingFullenrichFor = $state<string | null>(null);

  // Manual contact add
  let showAddContactInput = $state(false);
  let addContactUrl = $state("");
  let addingContact = $state(false);

  async function handleAddContactManually() {
    const url = addContactUrl.trim();
    if (!url) return;
    addingContact = true;
    try {
      const res = await fetch(`/api/offers/${offer.id}/add-contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedinUrl: url }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erreur");
      const newContact = await res.json();
      onContactUpdated?.(newContact);
      addContactUrl = "";
      showAddContactInput = false;
      toast.success("Contact ajouté !");

      if (isLinkedInEnabled) {
        enrichingFor = newContact.id;
        try {
          const enrichRes = await fetch(`/api/contacts/${newContact.id}/enrich-linkedin`, { method: "POST" });
          if (enrichRes.ok) {
            const enriched = await enrichRes.json();
            onContactUpdated?.({ ...newContact, ...enriched });
            toast.success(`Profil enrichi : ${enriched.fullName || url}`);
          }
        } catch { /* silent */ } finally {
          enrichingFor = null;
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      addingContact = false;
    }
  }
  let isSending = $state(false);
  let sendProgress = $state({ current: 0, total: 0, success: 0, failed: 0 });

  // Message history per linkedin URL
  let history = $state<Record<string, HistoryEntry[]>>({});
  let historyOpen = $state<Record<string, boolean>>({});
  let historyLoaded = $state(false);

  $effect(() => {
    const urls = contacts.map((c) => c.linkedinUrl).filter(Boolean) as string[];
    if (!urls.length) { historyLoaded = true; return; }
    fetch(`/api/message-history?linkedinUrls=${encodeURIComponent(urls.join(","))}`)
      .then((r) => r.json())
      .then((rows: HistoryEntry[] & { linkedinUrl?: string }[]) => {
        const byUrl: Record<string, HistoryEntry[]> = {};
        for (const row of rows) {
          const k = (row as HistoryEntry & { linkedinUrl?: string }).linkedinUrl || "";
          if (!byUrl[k]) byUrl[k] = [];
          byUrl[k].push(row);
        }
        history = byUrl;
      })
      .catch(() => {})
      .finally(() => { historyLoaded = true; });
  });

  // Inline field editing
  let editingField = $state<{ contactId: string; field: string } | null>(null);
  let editingValue = $state("");

  // Attachments per contact (only relevant for whatsapp/email)
  let attachments = $state<Record<string, File[]>>({});

  // Email subjects per contact (extracted from "Objet: ..." in the message)
  let subjects = $state<Record<string, string>>({});

  // Extra generation instructions per contact
  let customPrompts = $state<Record<string, string>>({});
  let promptOpen = $state<Record<string, boolean>>({});

  // Recipient selection per contact (value = the actual phone/email string)
  let selectedRecipient = $state<Record<string, string>>({});

  // ─── Find decision-makers ───────────────────────────────────
  type Candidate = {
    fullName: string;
    jobTitle: string;
    linkedinUrl: string;
    email: string | null;
    location: string | null;
  };

  const ROLE_CATEGORIES = [
    {
      key: "founder_ceo",
      label: "Fondateur / CEO",
      description: "Founder, Co-Founder, CEO, Président, DG…",
      color: "bg-purple-100 text-purple-700 border-purple-200",
    },
    {
      key: "sales",
      label: "Direction Commerciale",
      description: "VP Sales, Head of Sales, CRO, Directeur commercial…",
      color: "bg-blue-100 text-blue-700 border-blue-200",
    },
    {
      key: "coo",
      label: "Direction des Opérations",
      description: "COO, Chief Operating Officer, Chief of Staff…",
      color: "bg-amber-100 text-amber-700 border-amber-200",
    },
    {
      key: "hr",
      label: "RH / Recrutement",
      description: "HR Manager, Talent Acquisition, Responsable RH…",
      color: "bg-green-100 text-green-700 border-green-200",
    },
  ] as const;

  let showDmModal = $state(false);
  let dmStep = $state<"select" | "results">("select");
  let dmSelectedRoles = $state<Set<string>>(new Set(["founder_ceo"]));
  let dmSource = $state<"coresignal" | "web">("coresignal");
  let dmSearching = $state(false);
  let dmCandidates = $state<Candidate[]>([]);
  let dmSelectedCandidates = $state<Set<number>>(new Set());
  let dmAdding = $state(false);
  let dmError = $state<string | null>(null);

  async function searchDecisionMakers() {
    if (!dmSelectedRoles.size) { dmError = "Sélectionnez au moins un rôle."; return; }
    dmError = null;
    dmSearching = true;
    try {
      const endpoint = dmSource === "web"
        ? `/api/offers/${offer.id}/find-decision-makers-web`
        : `/api/offers/${offer.id}/find-decision-makers`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles: Array.from(dmSelectedRoles) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur");
      dmCandidates = json.candidates ?? [];
      // Pre-select all
      dmSelectedCandidates = new Set(dmCandidates.map((_, i) => i));
      dmStep = "results";
    } catch (e) {
      dmError = e instanceof Error ? e.message : "Erreur lors de la recherche";
    } finally {
      dmSearching = false;
    }
  }

  async function addSelectedCandidates() {
    dmAdding = true;
    try {
      const toAdd = dmCandidates.filter((_, i) => dmSelectedCandidates.has(i));
      const added: Contact[] = [];

      for (const c of toAdd) {
        const res = await fetch(`/api/offers/${offer.id}/add-contact`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            linkedinUrl: c.linkedinUrl,
            fullName: c.fullName,
            jobTitle: c.jobTitle,
            email: c.email,
          }),
        });
        if (res.ok) {
          const newContact = await res.json();
          onContactUpdated?.(newContact);
          added.push(newContact);
        }
      }

      toast.success(`${added.length} décisionnaire(s) ajouté(s) !`);
      showDmModal = false;
      dmStep = "select";

      // Auto-enrich LinkedIn profiles if LinkedIn is connected
      const toEnrich = added.filter((c) => c.linkedinUrl);
      if (toEnrich.length > 0 && isLinkedInEnabled) {
        toast.info(`Enrichissement LinkedIn de ${toEnrich.length} profil(s)…`);
        for (const c of toEnrich) {
          try {
            const enrichRes = await fetch(`/api/contacts/${c.id}/enrich-linkedin`, { method: "POST" });
            if (enrichRes.ok) {
              const updated = await enrichRes.json();
              onContactUpdated?.({ ...c, ...updated });
            }
          } catch { /* continue */ }
          await new Promise((r) => setTimeout(r, 800));
        }
        toast.success("Enrichissement LinkedIn terminé !");
      }
    } catch {
      toast.error("Erreur lors de l'ajout des contacts");
    } finally {
      dmAdding = false;
    }
  }

  function openDmModal() {
    dmStep = "select";
    dmSelectedRoles = new Set(["founder_ceo"]);
    dmCandidates = [];
    dmSelectedCandidates = new Set();
    dmError = null;
    showDmModal = true;
  }

  // Contacts that have a LinkedIn URL but haven't been enriched yet
  const unenrichedCount = $derived(
    contacts.filter((c) => c.linkedinUrl && !c.linkedinData).length
  );

  function extractSubjectFromMessage(msg: string): { subject: string; body: string } {
    const match = msg.match(/^Objet\s*:\s*(.+)$/im);
    if (match) {
      const subject = match[1].trim();
      const body = msg.replace(/^Objet\s*:\s*.+\n?/im, "").trim();
      return { subject, body };
    }
    return { subject: "", body: msg };
  }

  /** Convertit le texte brut (avec éventuelles balises <a>) en HTML safe pour aperçu */
  function messageToPreviewHtml(text: string): string {
    // Échappe tous les caractères HTML
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    // Restaure uniquement les <a href="...">...</a> générés par l'IA
    html = html.replace(
      /&lt;a href="([^"&]+)"&gt;(.+?)&lt;\/a&gt;/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-indigo-600 underline hover:text-indigo-800 transition-colors">$2</a>'
    );
    // Sauts de ligne → <br>
    html = html.replace(/\n/g, "<br>");
    return html;
  }

  // Returns the available recipient options for a contact given the current channel
  function getRecipientOptions(contact: Contact): string[] {
    if (deliveryChannel === "whatsapp") {
      return [contact.phone1, contact.phone2].filter((v): v is string => !!v);
    }
    if (deliveryChannel === "email") {
      const out: string[] = [];
      for (const v of [contact.email, contact.email2]) {
        if (v && !out.includes(v)) out.push(v);
      }
      return out;
    }
    return [];
  }

  // Auto-select when there is exactly 1 option; clear when channel changes
  $effect(() => {
    // Re-run whenever deliveryChannel or contacts change
    const _ch = deliveryChannel;
    const newSelected: Record<string, string> = {};
    for (const c of contacts) {
      const opts = getRecipientOptions(c);
      if (opts.length === 1) newSelected[c.id] = opts[0];
    }
    selectedRecipient = newSelected;
  });

  const linkedinCharLimit = 300;

  function buildLongAiMessage(contactId: string): string {
    const body = longMessages[contactId]?.trim() ?? "";
    const subject = (subjects[contactId] || "").trim();
    if (!body && !subject) return "";
    return subject ? `Objet: ${subject}\n\n${body}` : body;
  }

  // Intentional one-time init from initial contacts snapshot.
  // We do NOT use $effect here because we don't want this to re-run every time
  // onContactUpdated propagates back through the parent: generateMessage already
  // sets linkedinMessages / longMessages directly and that must not be overwritten.
  function initMessagesFromContacts(cs: Contact[]) {
    const initLong: Record<string, string> = {};
    const initLi: Record<string, string> = {};
    const initSubj: Record<string, string> = {};
    for (const c of cs) {
      if (c.aiMessageLinkedin?.trim()) {
        initLi[c.id] = c.aiMessageLinkedin;
      }
      if (c.aiMessage) {
        const { subject, body } = extractSubjectFromMessage(c.aiMessage);
        initLong[c.id] = subject ? body : c.aiMessage;
        if (subject) initSubj[c.id] = subject;
      }
    }
    return { initLi, initLong, initSubj };
  }

  const { initLi, initLong, initSubj } = initMessagesFromContacts(contacts);
  longMessages = initLong;
  linkedinMessages = initLi;
  subjects = initSubj;

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
    undefined: { label: "Non défini", color: "#bfdbfe" },
    no_answer: { label: "Ne répond pas", color: "#9ca3af" },
    interested: { label: "Intéressé", color: "#16a34a" },
    closed: { label: "Clôturé", color: "#6b7280" },
    // Legacy values (kept for backward-compat before migration runs)
    to_contact: { label: "Non défini", color: "#bfdbfe" },
    contacted: { label: "Non défini", color: "#bfdbfe" },
    contacted_linkedin: { label: "Non défini", color: "#bfdbfe" },
    contacted_whatsapp: { label: "Non défini", color: "#bfdbfe" },
    contacted_email: { label: "Non défini", color: "#bfdbfe" },
    replied: { label: "Non défini", color: "#bfdbfe" },
    waiting: { label: "Non défini", color: "#bfdbfe" },
    not_interested: { label: "Non défini", color: "#bfdbfe" },
  };

  async function generateMessage(contactId: string) {
    generatingFor = contactId;
    try {
      const res = await fetch(`/api/contacts/${contactId}/generate-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: deliveryChannel,
          extraInstructions: customPrompts[contactId] || "",
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Erreur");
      const updated = await res.json();
      if (deliveryChannel === "linkedin") {
        const raw = updated.aiMessageLinkedin || "";
        linkedinMessages = { ...linkedinMessages, [contactId]: raw };
      } else {
        const raw = updated.aiMessage || "";
        const { subject, body } = extractSubjectFromMessage(raw);
        if (subject) subjects = { ...subjects, [contactId]: subject };
        longMessages = { ...longMessages, [contactId]: subject ? body : raw };
      }
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
          body: JSON.stringify({
            channel: deliveryChannel,
            extraInstructions: customPrompts[contact.id] || "",
          }),
        });
        if (res.ok) {
          const updated = await res.json();
          if (deliveryChannel === "linkedin") {
            const raw = updated.aiMessageLinkedin || "";
            linkedinMessages = { ...linkedinMessages, [contact.id]: raw };
          } else {
            const raw = updated.aiMessage || "";
            const { subject, body } = extractSubjectFromMessage(raw);
            if (subject) subjects = { ...subjects, [contact.id]: subject };
            longMessages = { ...longMessages, [contact.id]: subject ? body : raw };
          }
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
    if (deliveryChannel === "linkedin") {
      if (linkedinMessages[contact.id] === undefined) return;
    } else if (longMessages[contact.id] === undefined) {
      return;
    }
    savingFor = contact.id;
    try {
      const payload =
        deliveryChannel === "linkedin"
          ? { aiMessageLinkedin: linkedinMessages[contact.id] ?? "" }
          : { aiMessage: buildLongAiMessage(contact.id) };
      const res = await fetch(`/api/contacts/${contact.id}/update-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  let enrichingFullenrichField = $state<Record<string, "email" | "phone">>({});

  async function enrichFullenrich(contact: Contact, field: "email" | "phone") {
    enrichingFullenrichFor = contact.id;
    enrichingFullenrichField = { ...enrichingFullenrichField, [contact.id]: field };
    try {
      // Trigger background Inngest job — returns immediately
      const res = await fetch(`/api/contacts/${contact.id}/enrich-fullenrich`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");

      toast.info(field === "email" ? "Recherche d'email en cours…" : "Recherche de téléphone en cours…");

      // Poll status endpoint until the contact is updated (max ~2.5 min)
      const snapshotAt = new Date(contact.updatedAt ?? 0).getTime();
      let found = false;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        try {
          const statusRes = await fetch(`/api/contacts/${contact.id}/enrich-fullenrich/status`);
          if (!statusRes.ok) continue;
          const status = await statusRes.json() as { email?: string | null; phone1?: string | null; updatedAt?: string };
          const updatedAt = new Date(status.updatedAt ?? 0).getTime();
          if (updatedAt > snapshotAt) {
            onContactUpdated?.({ ...contact, email: status.email, phone1: status.phone1, updatedAt: status.updatedAt });
            if (field === "email") toast.success(status.email ? `Email trouvé — ${status.email}` : "Aucun email trouvé");
            else toast.success(status.phone1 ? `Téléphone trouvé — ${status.phone1}` : "Aucun téléphone trouvé");
            found = true;
            break;
          }
        } catch { /* continue polling */ }
      }
      if (!found) toast.warning("L'enrichissement prend plus de temps que prévu. Vérifiez plus tard.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'enrichissement");
    } finally {
      enrichingFullenrichFor = null;
      const next = { ...enrichingFullenrichField };
      delete next[contact.id];
      enrichingFullenrichField = next;
    }
  }

  async function sendAllMessages() {
    const toSend = contacts.filter((c) => {
      const body =
        deliveryChannel === "linkedin" ? linkedinMessages[c.id] : longMessages[c.id];
      return body !== undefined && body.trim().length > 0;
    });
    if (!toSend.length) return;

    isSending = true;
    sendProgress = { current: 0, total: toSend.length, success: 0, failed: 0 };

    for (const contact of toSend) {
      try {
        const opts = getRecipientOptions(contact);
        const recipient = deliveryChannel !== "linkedin"
          ? (selectedRecipient[contact.id] ?? (opts.length === 1 ? opts[0] : undefined))
          : undefined;

        // Rebuild full message (prepend subject for email)
        const bodyText =
          deliveryChannel === "linkedin"
            ? linkedinMessages[contact.id]
            : longMessages[contact.id];
        const subject = deliveryChannel === "email" ? (subjects[contact.id] || "").trim() : "";
        const fullMessage = subject ? `Objet: ${subject}\n\n${bodyText}` : bodyText;

        const contactFiles = attachments[contact.id] ?? [];
        let fetchOpts: RequestInit;
        if (contactFiles.length > 0) {
          const fd = new FormData();
          fd.append("channel", deliveryChannel);
          fd.append("message", fullMessage);
          if (recipient) fd.append("recipient", recipient);
          for (const f of contactFiles) fd.append("attachments", f);
          fetchOpts = { method: "POST", body: fd };
        } else {
          fetchOpts = {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channel: deliveryChannel, message: fullMessage, ...(recipient ? { recipient } : {}) }),
          };
        }

        const res = await fetch(`/api/contacts/${contact.id}/send`, fetchOpts);
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

  async function deleteContact(contact: Contact) {
    if (!confirm(`Supprimer ${contact.fullName || "ce contact"} ?`)) return;
    try {
      const res = await fetch(`/api/contacts/${contact.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      onContactDeleted?.(contact.id);
      toast.success("Contact supprimé");
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  }

  function delay(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function focusOnMount(node: HTMLElement) {
    node.focus();
  }

  function startEdit(contactId: string, field: string, current: string | null) {
    editingField = { contactId, field };
    editingValue = current ?? "";
  }

  function cancelEdit() {
    editingField = null;
    editingValue = "";
  }

  function formatPhone(raw: string): string {
    const s = raw.trim();
    if (!s) return s;
    const digits = s.replace(/\D/g, "");
    if (!digits) return s;
    // +33 X XX XX XX XX
    if (digits.startsWith("33") && digits.length === 11) {
      const d = digits.slice(2);
      return `+33 ${d[0]} ${d.slice(1, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
    }
    // 0X XX XX XX XX
    if (digits.startsWith("0") && digits.length === 10) {
      return digits.replace(/(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, "$1 $2 $3 $4 $5");
    }
    // Already international with + but no spaces → reformat
    if (s.startsWith("+") && digits.length >= 10) {
      const country = digits.slice(0, digits.length - 9);
      const local = digits.slice(digits.length - 9);
      return `+${country} ${local[0]} ${local.slice(1, 3)} ${local.slice(3, 5)} ${local.slice(5, 7)} ${local.slice(7, 9)}`;
    }
    return s;
  }

  async function saveContactField(contact: Contact, field: string, value: string) {
    const isPhone = field === "phone1" || field === "phone2";
    const trimmed = isPhone ? formatPhone(value) : value.trim();
    editingField = null;
    editingValue = "";
    try {
      const res = await fetch(`/api/contacts/${contact.id}/update-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: trimmed || null }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      onContactUpdated?.({ ...contact, ...updated });

      // Auto-enrich via Unipile when a LinkedIn URL is saved
      if (field === "linkedinUrl" && trimmed && isLinkedInEnabled) {
        enrichingFor = contact.id;
        try {
          const enrichRes = await fetch(`/api/contacts/${contact.id}/enrich-linkedin`, { method: "POST" });
          if (enrichRes.ok) {
            const enriched = await enrichRes.json();
            onContactUpdated?.({ ...contact, ...updated, ...enriched });
            toast.success(`Profil enrichi : ${enriched.fullName || trimmed}`);
          }
        } catch { /* silent */ } finally {
          enrichingFor = null;
        }
      }
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    }
  }

  // A contact is "ready to send" if it has a message AND a resolved recipient
  const contactsWithMessages = $derived(
    contacts.filter((c) => {
      const hasBody =
        deliveryChannel === "linkedin"
          ? linkedinMessages[c.id]?.trim()
          : longMessages[c.id]?.trim();
      if (!hasBody) return false;
      if (deliveryChannel === "linkedin") return true;
      const opts = getRecipientOptions(c);
      if (opts.length === 0) return false;
      if (opts.length === 1) return true; // auto-selected
      return !!selectedRecipient[c.id]; // requires explicit selection
    })
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
<div class="fixed right-0 top-0 h-full w-full max-w-2xl bg-background border-l border-border shadow-2xl z-50 flex flex-col overflow-hidden {isDisabled ? 'offer-sheet-disabled' : ''}">

  {#if isDisabled}
    <div class="flex items-center gap-2 px-6 py-2 bg-gray-100 border-b border-gray-200 text-xs text-gray-600 flex-shrink-0">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
      <span>Cette offre est désactivée — ses contacts sont masqués du CRM et l'envoi est bloqué.</span>
    </div>
  {/if}

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

      {#if offer.duplicateOffers && offer.duplicateOffers.length > 0}
        <div class="mt-2 p-2.5 rounded-md bg-amber-50 border border-amber-200">
          <div class="flex items-center gap-1.5 text-xs font-medium text-amber-900 mb-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            {offer.duplicateOffers.length === 1
              ? "Cette entreprise est aussi présente dans une autre liste"
              : `Cette entreprise est aussi présente dans ${offer.duplicateOffers.length} autres listes`}
          </div>
          <ul class="space-y-1">
            {#each offer.duplicateOffers as dup (dup.id)}
              <li class="flex items-center gap-1.5 text-xs">
                <a
                  href={`/lists/${dup.listId}?offer=${dup.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1 text-amber-900 hover:text-amber-700 hover:underline font-medium truncate"
                  title={`Ouvrir l'offre « ${dup.offerTitle || dup.companyName} » dans un nouvel onglet`}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="flex-shrink-0">
                    <path d="M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                  <span class="truncate">{dup.offerTitle || "(sans titre)"}</span>
                </a>
                <span class="text-amber-700">·</span>
                <span class="text-amber-700 truncate" title={`Dans la liste « ${dup.listName} »`}>
                  {dup.listName}
                </span>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>
    <div class="flex items-center gap-1 ml-4 flex-shrink-0">
      <button
        onclick={toggleDisabled}
        disabled={togglingDisabled}
        aria-label={isDisabled ? "Réactiver l'offre" : "Désactiver l'offre"}
        title={isDisabled ? "Réactiver l'offre (elle réapparaîtra dans le CRM)" : "Désactiver l'offre (elle sera grisée et exclue du CRM)"}
        class="inline-flex items-center gap-1.5 px-2 py-1 text-xs border rounded-md transition-colors disabled:opacity-50 {isDisabled ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50' : 'border-input text-muted-foreground hover:bg-accent'}"
      >
        {#if togglingDisabled}
          <span class="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
        {:else if isDisabled}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
          Réactiver
        {:else}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
          Désactiver
        {/if}
      </button>
      {#if onOfferDeleted}
        <button
          onclick={() => onOfferDeleted!(offer.id)}
          aria-label="Supprimer l'offre"
          title="Supprimer l'offre"
          class="p-2 rounded-md hover:bg-red-50 transition-colors text-red-400 hover:text-red-600"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      {/if}
      <button
        onclick={onClose}
        aria-label="Fermer"
        class="p-2 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
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
  <div class="flex items-center gap-3 px-6 py-3 border-b border-border bg-muted/30 flex-shrink-0 flex-wrap" style="row-gap: 0.5rem;">
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

    <!-- Find decision-makers -->
    <button
      onclick={openDmModal}
      class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-indigo-200 text-indigo-700 bg-indigo-50 rounded-md hover:bg-indigo-100 transition-colors"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6M8 11h6"/></svg>
      Trouver des décisionnaires
    </button>

    <button
      onclick={() => (showAddContactInput = !showAddContactInput)}
      class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-indigo-200 text-indigo-600 rounded-md hover:bg-indigo-50 transition-colors"
      title="Ajouter un contact manuellement via son URL LinkedIn"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Ajouter
    </button>

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

  <!-- Manual add contact -->
  {#if showAddContactInput}
    <div class="px-6 pb-3 flex gap-2">
      <input
        type="text"
        bind:value={addContactUrl}
        placeholder="https://linkedin.com/in/…"
        class="flex-1 px-3 py-1.5 text-sm border border-indigo-300 rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono"
        onkeydown={(e) => {
          if (e.key === "Enter") handleAddContactManually();
          if (e.key === "Escape") { showAddContactInput = false; addContactUrl = ""; }
        }}
      />
      <button
        onclick={handleAddContactManually}
        disabled={addingContact || !addContactUrl.trim()}
        class="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors shrink-0"
      >
        {addingContact ? "…" : "Ajouter"}
      </button>
      <button
        onclick={() => { showAddContactInput = false; addContactUrl = ""; }}
        class="px-2 py-1.5 text-sm border border-input rounded-md hover:bg-accent transition-colors"
      >✕</button>
    </div>
  {/if}

  <!-- Contacts list -->
  <div class="flex-1 overflow-y-auto px-6 py-4 space-y-4">
    {#if contacts.length === 0}
      <div class="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm">
        <p>Aucun contact pour cette offre</p>
        <button
          onclick={() => (showAddContactInput = true)}
          class="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-indigo-200 text-indigo-600 rounded-md hover:bg-indigo-50 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Ajouter un contact LinkedIn
        </button>
      </div>
    {:else}
      {#each contacts as contact (contact.id)}
        {@const pic = getProfilePicture(contact)}
        {@const name = contact.fullName || contact.email || contact.linkedinUrl || "Contact"}
        {@const status = statusLabels[contact.contactStatus || "undefined"] || statusLabels.undefined}
        {@const msg =
          deliveryChannel === "linkedin" ? linkedinMessages[contact.id] : longMessages[contact.id]}
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
              <!-- Email, phones & LinkedIn inline edit -->
              <div class="flex items-center gap-2 flex-wrap mt-1">
                {#each [
                  { field: "email", icon: "✉", value: contact.email, placeholder: "+ email" },
                  { field: "phone1", icon: "📞", value: contact.phone1, placeholder: "+ tél 1" },
                  { field: "phone2", icon: "📞", value: contact.phone2, placeholder: "+ tél 2" },
                  { field: "linkedinUrl", icon: "🔗", value: contact.linkedinUrl, placeholder: "+ LinkedIn URL" },
                ] as item}
                  {#if editingField?.contactId === contact.id && editingField.field === item.field}
                    <input
                      type="text"
                      class="text-xs border border-indigo-400 rounded px-1.5 py-0.5 w-36 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-background"
                      value={editingValue}
                      oninput={(e) => (editingValue = (e.target as HTMLInputElement).value)}
                      onblur={() => saveContactField(contact, item.field, editingValue)}
                      onkeydown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); saveContactField(contact, item.field, editingValue); }
                        if (e.key === "Escape") cancelEdit();
                      }}
                      use:focusOnMount
                    />
                  {:else}
                    <button
                      type="button"
                      onclick={() => startEdit(contact.id, item.field, item.value)}
                      class="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded hover:bg-accent transition-colors {item.value ? 'text-muted-foreground' : 'text-muted-foreground/50 italic'}"
                      title="Modifier"
                    >
                      <span>{item.icon}</span>
                      <span>{item.value ?? item.placeholder}</span>
                    </button>
                  {/if}
                {/each}
              </div>
            </div>

            <!-- Action buttons -->
            <div class="flex items-center gap-1.5 flex-shrink-0">
              <button
                onclick={() => deleteContact(contact)}
                class="p-1.5 rounded hover:bg-red-50 hover:text-red-500 text-muted-foreground transition-colors"
                title="Supprimer ce contact"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14H6L5 6"/>
                  <path d="M10 11v6"/><path d="M14 11v6"/>
                  <path d="M9 6V4h6v2"/>
                </svg>
              </button>
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
              {#if contact.linkedinUrl}
                <button
                  onclick={() => enrichContact(contact)}
                  disabled={isEnriching || enrichingAll || !isLinkedInEnabled}
                  class="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-blue-200 text-blue-600 rounded-md hover:bg-blue-50 disabled:opacity-50 transition-colors"
                  title={!isLinkedInEnabled
                    ? "Connectez un compte LinkedIn dans les paramètres pour enrichir"
                    : needsEnrich
                      ? "Enrichir le profil LinkedIn"
                      : "Ré-enrichir le profil LinkedIn (écrase les données existantes)"}
                >
                  {#if isEnriching}
                    <span class="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></span>
                  {:else if needsEnrich}
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  {:else}
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                  {/if}
                  {needsEnrich ? "Enrichir" : "Ré-enrichir"}
                </button>
              {/if}
              {#if fullenrichEnabled && (contact.linkedinUrl || contact.fullName)}
                {@const isEnrichingFull = enrichingFullenrichFor === contact.id}
                {@const enrichingField = enrichingFullenrichField[contact.id]}
                <button
                  onclick={() => enrichFullenrich(contact, "email")}
                  disabled={isEnrichingFull}
                  class="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-emerald-200 text-emerald-700 rounded-md hover:bg-emerald-50 disabled:opacity-50 transition-colors"
                  title="Trouver l'email via Fullenrich"
                >
                  {#if isEnrichingFull && enrichingField === "email"}
                    <span class="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></span>
                  {:else}
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                  {/if}
                  Email
                </button>
                <button
                  onclick={() => enrichFullenrich(contact, "phone")}
                  disabled={isEnrichingFull}
                  class="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-emerald-200 text-emerald-700 rounded-md hover:bg-emerald-50 disabled:opacity-50 transition-colors"
                  title="Trouver le téléphone via Fullenrich"
                >
                  {#if isEnrichingFull && enrichingField === "phone"}
                    <span class="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></span>
                  {:else}
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  {/if}
                  Tél
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

          <!-- Message history (per LinkedIn URL) -->
          {#if contact.linkedinUrl && historyLoaded}
            {@const entries = history[contact.linkedinUrl] ?? []}
            {#if entries.length > 0}
              <div class="border-t border-border px-4 pt-2 pb-1">
                <button
                  type="button"
                  onclick={() => (historyOpen = { ...historyOpen, [contact.id]: !historyOpen[contact.id] })}
                  class="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full py-1"
                >
                  <svg
                    width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round"
                    class="transition-transform {historyOpen[contact.id] ? 'rotate-90' : ''}"
                  >
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                  {entries.length} message{entries.length > 1 ? "s" : ""} envoyé{entries.length > 1 ? "s" : ""}
                </button>
                {#if historyOpen[contact.id]}
                  <div class="space-y-2 pb-2 mt-1">
                    {#each entries as entry}
                      {@const channelIcon = entry.channel === "linkedin" ? "💼" : entry.channel === "whatsapp" ? "💬" : "✉"}
                      {@const date = new Date(entry.sentAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      <div class="rounded-lg border border-border bg-muted/30 px-3 py-2 space-y-1">
                        <div class="flex items-center justify-between gap-2">
                          <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span>{channelIcon}</span>
                            <span class="font-medium capitalize">{entry.channel}</span>
                            {#if entry.recipient}
                              <span class="text-muted-foreground/60">→ {entry.recipient}</span>
                            {/if}
                            {#if entry.offerTitle}
                              <span class="text-muted-foreground/60">· {entry.offerTitle}</span>
                            {/if}
                          </div>
                          <span class="text-xs text-muted-foreground/60 shrink-0">{date}</span>
                        </div>
                        <p class="text-xs text-foreground/80 line-clamp-3 whitespace-pre-line">{entry.message}</p>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          {/if}

          <!-- Message zone -->
          <div class="px-4 py-3 space-y-2">
            <!-- Extra prompt instructions (collapsible) -->
            <div>
              <button
                type="button"
                onclick={() => (promptOpen = { ...promptOpen, [contact.id]: !promptOpen[contact.id] })}
                class="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg
                  width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round"
                  class="transition-transform {promptOpen[contact.id] ? 'rotate-90' : ''}"
                >
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
                Instructions pour la génération
                {#if customPrompts[contact.id]}
                  <span class="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                {/if}
              </button>
              {#if promptOpen[contact.id]}
                <textarea
                  rows={2}
                  value={customPrompts[contact.id] ?? ""}
                  oninput={(e) => (customPrompts = { ...customPrompts, [contact.id]: (e.target as HTMLTextAreaElement).value })}
                  placeholder="Ex: Mets l'accent sur son expérience en SaaS, sois plus direct, utilise le tutoiement…"
                  class="mt-1.5 w-full rounded-md border border-indigo-200 bg-indigo-50/50 px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none placeholder:text-muted-foreground/60"
                ></textarea>
              {/if}
            </div>

            {#if msg !== undefined}
              <!-- Subject field (email only) -->
              {#if deliveryChannel === "email"}
                <input
                  type="text"
                  value={subjects[contact.id] ?? ""}
                  oninput={(e) => (subjects = { ...subjects, [contact.id]: (e.target as HTMLInputElement).value })}
                  placeholder="Objet de l'email…"
                  class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring font-medium"
                />
              {/if}

              <!-- Barre édition / aperçu -->
              <div class="flex items-center justify-between mb-1">
                <div class="inline-flex rounded-md border border-input overflow-hidden text-xs">
                  <button
                    type="button"
                    onclick={() => (previewOpen = { ...previewOpen, [contact.id]: false })}
                    class="px-2.5 py-1 transition-colors {!previewOpen[contact.id] ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:bg-accent'}"
                  >Éditer</button>
                  <button
                    type="button"
                    onclick={() => (previewOpen = { ...previewOpen, [contact.id]: true })}
                    class="px-2.5 py-1 transition-colors {previewOpen[contact.id] ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:bg-accent'}"
                  >
                    <span class="flex items-center gap-1">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                      Aperçu
                    </span>
                  </button>
                </div>
              </div>

              {#if previewOpen[contact.id]}
                <!-- Rendu HTML du message -->
                <div
                  class="w-full rounded-md border border-input bg-muted/30 px-3 py-2.5 text-sm leading-relaxed min-h-[9rem] whitespace-pre-wrap"
                  style="word-break: break-word"
                >
                  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                  {@html messageToPreviewHtml(msg)}
                </div>
              {:else}
                <textarea
                  value={msg}
                  oninput={(e) => {
                    const v = (e.target as HTMLTextAreaElement).value;
                    if (deliveryChannel === "linkedin") {
                      linkedinMessages = { ...linkedinMessages, [contact.id]: v };
                    } else {
                      longMessages = { ...longMessages, [contact.id]: v };
                    }
                  }}
                  rows={8}
                  maxlength={deliveryChannel === "linkedin" ? linkedinCharLimit : undefined}
                  class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  placeholder="Le message apparaîtra ici…"
                ></textarea>
              {/if}

              <!-- Recipient selector (whatsapp/email, only if ≥2 options) -->
              {#if deliveryChannel !== "linkedin"}
                {@const opts = getRecipientOptions(contact)}
                {#if opts.length === 0}
                  <p class="text-xs text-amber-600 italic">Aucun {deliveryChannel === "whatsapp" ? "numéro" : "email"} renseigné</p>
                {:else if opts.length >= 2}
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-xs text-muted-foreground">Envoyer à :</span>
                    {#each opts as opt}
                      <button
                        type="button"
                        onclick={() => (selectedRecipient = { ...selectedRecipient, [contact.id]: opt })}
                        class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border transition-colors {selectedRecipient[contact.id] === opt ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-medium' : 'border-input text-muted-foreground hover:bg-accent'}"
                      >
                        <span class="w-2 h-2 rounded-full flex-shrink-0 {selectedRecipient[contact.id] === opt ? 'bg-indigo-500' : 'bg-muted-foreground/30'}"></span>
                        {opt}
                      </button>
                    {/each}
                  </div>
                {/if}
              {/if}

              <!-- Attachments (email & whatsapp only) -->
              {#if deliveryChannel !== "linkedin"}
                {@const contactFiles = attachments[contact.id] ?? []}
                <div class="flex items-center gap-2 flex-wrap">
                  <label
                    class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs border border-input rounded-md hover:bg-accent transition-colors cursor-pointer text-muted-foreground"
                    title="Ajouter une pièce jointe"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                    </svg>
                    Joindre un fichier
                    <input
                      type="file"
                      multiple
                      class="hidden"
                      onchange={(e) => {
                        const files = Array.from((e.target as HTMLInputElement).files ?? []);
                        attachments = { ...attachments, [contact.id]: [...(attachments[contact.id] ?? []), ...files] };
                        (e.target as HTMLInputElement).value = "";
                      }}
                    />
                  </label>
                  {#each contactFiles as file, i}
                    <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted text-foreground">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      </svg>
                      {file.name}
                      <button
                        type="button"
                        onclick={() => {
                          attachments = {
                            ...attachments,
                            [contact.id]: (attachments[contact.id] ?? []).filter((_, j) => j !== i),
                          };
                        }}
                        class="ml-0.5 hover:text-destructive transition-colors"
                      >×</button>
                    </span>
                  {/each}
                </div>
              {/if}

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

<!-- ─── Decision-Makers Modal ─────────────────────────────── -->
{#if showDmModal}
  <div
    class="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
    onclick={(e) => { if (e.target === e.currentTarget) showDmModal = false; }}
    onkeydown={(e) => { if (e.key === "Escape") showDmModal = false; }}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]">

      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h3 class="text-base font-semibold">Trouver des décisionnaires</h3>
          <p class="text-xs text-muted-foreground mt-0.5">{offer.companyName}</p>
        </div>
        <button
          onclick={() => (showDmModal = false)}
          aria-label="Fermer"
          class="p-2 rounded-md hover:bg-accent transition-colors text-muted-foreground"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <!-- Step indicator -->
      <div class="flex items-center gap-2 px-6 py-2 border-b border-border bg-muted/20 text-xs text-muted-foreground">
        <span class="font-medium {dmStep === 'select' ? 'text-indigo-600' : 'text-green-600'}">1. Rôles</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        <span class="font-medium {dmStep === 'results' ? 'text-indigo-600' : ''}">2. Résultats</span>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto px-6 py-5">

        {#if dmStep === "select"}
          <p class="text-sm text-muted-foreground mb-4">
            Sélectionnez les catégories de décisionnaires à rechercher chez <strong>{offer.companyName}</strong>.
          </p>

          <!-- Source selector -->
          <div class="mb-5">
            <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Source</p>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                onclick={() => (dmSource = "coresignal")}
                class="text-left p-3 rounded-xl border-2 transition-all {dmSource === 'coresignal' ? 'border-indigo-400 bg-indigo-50' : 'border-border hover:border-indigo-200 hover:bg-muted/30'}"
              >
                <div class="flex items-center gap-2">
                  <div class="w-2 h-2 rounded-full {dmSource === 'coresignal' ? 'bg-indigo-500' : 'bg-muted-foreground/30'}"></div>
                  <span class="text-sm font-medium">Coresignal</span>
                </div>
                <p class="text-xs text-muted-foreground mt-1">Base de données pro enrichie. Idéal pour des boîtes connues.</p>
              </button>
              <button
                type="button"
                onclick={() => (dmSource = "web")}
                class="text-left p-3 rounded-xl border-2 transition-all {dmSource === 'web' ? 'border-indigo-400 bg-indigo-50' : 'border-border hover:border-indigo-200 hover:bg-muted/30'}"
              >
                <div class="flex items-center gap-2">
                  <div class="w-2 h-2 rounded-full {dmSource === 'web' ? 'bg-indigo-500' : 'bg-muted-foreground/30'}"></div>
                  <span class="text-sm font-medium">Recherche web</span>
                </div>
                <p class="text-xs text-muted-foreground mt-1">Google + LinkedIn via IA. Utile quand Coresignal ne couvre pas.</p>
              </button>
            </div>
          </div>

          <div class="space-y-3">
            {#each ROLE_CATEGORIES as cat}
              {@const checked = dmSelectedRoles.has(cat.key)}
              <button
                type="button"
                onclick={() => {
                  const next = new Set(dmSelectedRoles);
                  if (next.has(cat.key)) next.delete(cat.key); else next.add(cat.key);
                  dmSelectedRoles = next;
                }}
                class="w-full flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all {checked ? 'border-indigo-400 bg-indigo-50' : 'border-border hover:border-indigo-200 hover:bg-muted/30'}"
              >
                <!-- Checkbox visual -->
                <div class="mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 {checked ? 'border-indigo-500 bg-indigo-500' : 'border-muted-foreground/40'}">
                  {#if checked}
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  {/if}
                </div>
                <div class="flex-1 min-w-0">
                  <span class="text-sm font-medium">{cat.label}</span>
                  <p class="text-xs text-muted-foreground mt-0.5">{cat.description}</p>
                </div>
                <span class="text-xs px-2 py-0.5 rounded-full border {cat.color} flex-shrink-0 mt-0.5">{cat.label.split(" ")[0]}</span>
              </button>
            {/each}
          </div>

          {#if dmError}
            <p class="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{dmError}</p>
          {/if}

        {:else}
          <!-- Results -->
          {#if dmCandidates.length === 0}
            <div class="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm text-center">
              <svg class="mb-3 opacity-30" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <p class="font-medium">Aucun décisionnaire trouvé</p>
              <p class="text-xs mt-1 text-muted-foreground/70">Essayez d'autres catégories ou vérifiez l'URL de l'offre</p>
              <button onclick={() => (dmStep = "select")} class="mt-4 text-xs text-indigo-600 underline">← Modifier la sélection</button>
            </div>
          {:else}
            <div class="flex items-center justify-between mb-3">
              <p class="text-sm font-medium">{dmCandidates.length} décisionnaire{dmCandidates.length > 1 ? "s" : ""} trouvé{dmCandidates.length > 1 ? "s" : ""}</p>
              <div class="flex items-center gap-3">
                <button onclick={() => (dmSelectedCandidates = new Set(dmCandidates.map((_, i) => i)))} class="text-xs text-indigo-600 hover:underline">Tout sélectionner</button>
                <button onclick={() => (dmSelectedCandidates = new Set())} class="text-xs text-muted-foreground hover:underline">Désélectionner</button>
              </div>
            </div>
            <div class="space-y-2">
              {#each dmCandidates as candidate, i}
                {@const isSelected = dmSelectedCandidates.has(i)}
                <div
                  role="checkbox"
                  aria-checked={isSelected}
                  tabindex="0"
                  onclick={() => {
                    const next = new Set(dmSelectedCandidates);
                    if (next.has(i)) next.delete(i); else next.add(i);
                    dmSelectedCandidates = next;
                  }}
                  onkeydown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      const next = new Set(dmSelectedCandidates);
                      if (next.has(i)) next.delete(i); else next.add(i);
                      dmSelectedCandidates = next;
                    }
                  }}
                  class="w-full flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all cursor-pointer {isSelected ? 'border-indigo-400 bg-indigo-50' : 'border-border hover:border-indigo-200'}"
                >
                  <!-- Checkbox -->
                  <div class="mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 {isSelected ? 'border-indigo-500 bg-indigo-500' : 'border-muted-foreground/40'}">
                    {#if isSelected}
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    {/if}
                  </div>
                  <!-- Avatar initial -->
                  <div class="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                    {candidate.fullName.charAt(0).toUpperCase()}
                  </div>
                  <!-- Info -->
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-foreground">{candidate.fullName}</p>
                    <p class="text-xs text-muted-foreground">{candidate.jobTitle}</p>
                    {#if candidate.email}
                      <p class="text-xs text-muted-foreground/70 mt-0.5">✉ {candidate.email}</p>
                    {/if}
                  </div>
                  <!-- LinkedIn link -->
                  {#if candidate.linkedinUrl}
                    <a
                      href={candidate.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onclick={(e) => e.stopPropagation()}
                      class="p-1.5 rounded-md hover:bg-blue-100 transition-colors flex-shrink-0 mt-0.5"
                      title="Voir sur LinkedIn"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="#0a66c2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                    </a>
                  {:else}
                    <div class="w-7 h-7 flex-shrink-0"></div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        {/if}
      </div>

      <!-- Footer -->
      <div class="flex-shrink-0 border-t border-border px-6 py-4 flex items-center justify-between gap-3">
        {#if dmStep === "select"}
          <span class="text-xs text-muted-foreground">
            {dmSelectedRoles.size} catégorie{dmSelectedRoles.size > 1 ? "s" : ""} sélectionnée{dmSelectedRoles.size > 1 ? "s" : ""}
          </span>
          <button
            onclick={searchDecisionMakers}
            disabled={dmSearching || dmSelectedRoles.size === 0}
            class="inline-flex items-center gap-2 px-5 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {#if dmSearching}
              <span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              Recherche en cours…
            {:else}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              Rechercher
            {/if}
          </button>
        {:else}
          <button onclick={() => (dmStep = "select")} class="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Modifier
          </button>
          <button
            onclick={addSelectedCandidates}
            disabled={dmAdding || dmSelectedCandidates.size === 0}
            class="inline-flex items-center gap-2 px-5 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {#if dmAdding}
              <span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              Ajout…
            {:else}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
              Ajouter {dmSelectedCandidates.size > 0 ? `(${dmSelectedCandidates.size})` : ""}
            {/if}
          </button>
        {/if}
      </div>

    </div>
  </div>
{/if}

<style>
  /* Subtle grayscale on disabled offer sheet so the whole panel reads as "archived".
     Header/banner/close buttons stay clickable — we only desaturate visuals. */
  :global(.offer-sheet-disabled) {
    filter: grayscale(0.7);
  }
</style>
