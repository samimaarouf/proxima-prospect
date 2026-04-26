<script lang="ts">
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import AgGrid from "$lib/components/custom/AgGrid/AgGrid.svelte";
  import CompanySheet from "$lib/components/CompanySheet.svelte";
  import {
    STATUS_OPTIONS,
    resolveStatus,
    isTerminalStatus,
    type ContactStatusValue,
  } from "$lib/constants/contactStatus";
  import {
    NEXT_STEP_LABELS,
    resolveNextStepLabel,
  } from "$lib/constants/nextStepLabels";
  import type {
    ColDef,
    GridOptions,
    ICellRendererParams,
    CellClickedEvent,
  } from "@ag-grid-community/core";

  type CrmRow = {
    id: string;
    fullName: string | null;
    linkedinUrl: string | null;
    email: string | null;
    email2: string | null;
    phone1: string | null;
    phone2: string | null;
    offerId: string;
    offerTitle: string | null;
    offerUrl: string | null;
    companyName: string;
    offerDisabledAt: string | null;
    listId: string;
    listName: string;
    emailSentAt: string | null;
    linkedinSentAt: string | null;
    whatsappSentAt: string | null;
    calledAt: string | null;
    nextStepAt: string | null;
    nextStep: string | null;
    contactStatus: string | null;
    notes: string | null;
    inCrm: boolean | null;
    priority: number;
  };

  type DateField =
    | "emailSentAt"
    | "linkedinSentAt"
    | "whatsappSentAt"
    | "calledAt"
    | "nextStepAt";

  type Channel = "email" | "linkedin" | "whatsapp";

  const DATE_META: Record<
    DateField,
    { label: string; channel: Channel | null }
  > = {
    emailSentAt: { label: "Email envoyé", channel: "email" },
    linkedinSentAt: { label: "LinkedIn envoyé", channel: "linkedin" },
    whatsappSentAt: { label: "WhatsApp envoyé", channel: "whatsapp" },
    calledAt: { label: "Date d'appel", channel: null },
    nextStepAt: { label: "Next step", channel: null },
  };

  let rows = $state<CrmRow[]>([]);
  let loading = $state(true);
  let quickFilter = $state("");

  let { listId = undefined }: { listId?: string } = $props();

  // Company sheet (opened by clicking on an offer row)
  let companySheetName = $state<string | null>(null);

  // ===========================
  // Popup states
  // ===========================
  let dateEditPopup = $state<{
    open: boolean;
    rowId: string | null;
    field: DateField | null;
    contactName: string;
    dateValue: string; // yyyy-mm-dd
    channel: Channel | null;
    messageLoading: boolean;
    message: string | null;
    recipient: string | null;
  }>({
    open: false,
    rowId: null,
    field: null,
    contactName: "",
    dateValue: "",
    channel: null,
    messageLoading: false,
    message: null,
    recipient: null,
  });

  let statusEditPopup = $state<{
    open: boolean;
    rowId: string | null;
    contactName: string;
    currentValue: ContactStatusValue;
  }>({
    open: false,
    rowId: null,
    contactName: "",
    currentValue: "undefined",
  });

  let notesEditPopup = $state<{
    open: boolean;
    rowId: string | null;
    contactName: string;
    value: string;
  }>({
    open: false,
    rowId: null,
    contactName: "",
    value: "",
  });

  let nextStepEditPopup = $state<{
    open: boolean;
    rowId: string | null;
    contactName: string;
    labelValue: string;
    dateValue: string; // yyyy-mm-dd
  }>({
    open: false,
    rowId: null,
    contactName: "",
    labelValue: "",
    dateValue: "",
  });

  function closeDatePopup() {
    dateEditPopup = { ...dateEditPopup, open: false };
  }

  function closeStatusPopup() {
    statusEditPopup = { ...statusEditPopup, open: false };
  }

  function closeNotesPopup() {
    notesEditPopup = { ...notesEditPopup, open: false };
  }

  function closeNextStepPopup() {
    nextStepEditPopup = { ...nextStepEditPopup, open: false };
  }

  // ===========================
  // Data
  // ===========================
  async function loadCrm() {
    loading = true;
    try {
      const url = listId ? `/api/crm?listId=${listId}` : "/api/crm";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Erreur de chargement");
      rows = await res.json();
    } catch (err) {
      toast.error("Impossible de charger le CRM");
    } finally {
      loading = false;
    }
  }

  async function removeFromCrm(row: CrmRow) {
    rows = rows.filter((r) => r.id !== row.id);
    try {
      const res = await fetch(`/api/contacts/${row.id}/update-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inCrm: false }),
      });
      if (!res.ok) throw new Error();
      toast.success("Contact retiré du CRM");
    } catch {
      rows = [...rows, row];
      toast.error("Erreur lors de la mise à jour");
    }
  }

  onMount(() => {
    loadCrm();
  });

  // ===========================
  // Helpers
  // ===========================
  function formatDate(value: string | null | undefined): string {
    if (!value) return "";
    const d = new Date(value);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  function isToday(value: string | null | undefined): boolean {
    if (!value) return false;
    const d = new Date(value);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  }

  function toISODateInputValue(value: string | null | undefined): string {
    if (!value) return "";
    const d = new Date(value);
    if (isNaN(d.getTime())) return "";
    const tzOffsetMs = d.getTimezoneOffset() * 60_000;
    const local = new Date(d.getTime() - tzOffsetMs);
    return local.toISOString().slice(0, 10);
  }

  function updateLocalRow(rowId: string, patch: Partial<CrmRow>) {
    rows = rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r));
  }

  async function persistUpdate(rowId: string, body: Record<string, unknown>) {
    try {
      const res = await fetch(`/api/contacts/${rowId}/update-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      toast.success("Modification enregistrée");
      return true;
    } catch {
      toast.error("Erreur lors de l'enregistrement");
      return false;
    }
  }

  // ===========================
  // Date popup
  // ===========================
  async function openDateEditPopup(row: CrmRow, field: DateField) {
    const meta = DATE_META[field];
    const iso = row[field] as string | null;
    dateEditPopup = {
      open: true,
      rowId: row.id,
      field,
      contactName: row.fullName || "—",
      dateValue: toISODateInputValue(iso),
      channel: meta.channel,
      messageLoading: meta.channel !== null,
      message: null,
      recipient: null,
    };

    if (meta.channel && row.linkedinUrl) {
      try {
        const res = await fetch(
          `/api/message-history?linkedinUrls=${encodeURIComponent(row.linkedinUrl)}`,
        );
        if (!res.ok) throw new Error();
        const history = (await res.json()) as Array<{
          channel: string;
          sentAt: string;
          message: string;
          recipient: string | null;
        }>;
        const match = history.find((h) => h.channel === meta.channel);
        dateEditPopup = {
          ...dateEditPopup,
          messageLoading: false,
          message: match?.message || null,
          recipient: match?.recipient || null,
        };
      } catch {
        dateEditPopup = {
          ...dateEditPopup,
          messageLoading: false,
          message: null,
        };
      }
    } else {
      dateEditPopup = { ...dateEditPopup, messageLoading: false };
    }
  }

  async function saveDatePopup() {
    if (!dateEditPopup.rowId || !dateEditPopup.field) return;
    const rowId = dateEditPopup.rowId;
    const field = dateEditPopup.field;
    const iso = dateEditPopup.dateValue
      ? new Date(dateEditPopup.dateValue).toISOString()
      : null;
    updateLocalRow(rowId, { [field]: iso } as Partial<CrmRow>);
    closeDatePopup();
    await persistUpdate(rowId, { [field]: iso });
  }

  async function clearDatePopup() {
    if (!dateEditPopup.rowId || !dateEditPopup.field) return;
    const rowId = dateEditPopup.rowId;
    const field = dateEditPopup.field;
    updateLocalRow(rowId, { [field]: null } as Partial<CrmRow>);
    closeDatePopup();
    await persistUpdate(rowId, { [field]: null });
  }

  // ===========================
  // Status popup
  // ===========================
  function openStatusEditPopup(row: CrmRow) {
    statusEditPopup = {
      open: true,
      rowId: row.id,
      contactName: row.fullName || "—",
      currentValue: (row.contactStatus as ContactStatusValue) || "undefined",
    };
  }

  async function pickStatus(value: ContactStatusValue) {
    if (!statusEditPopup.rowId) return;
    const rowId = statusEditPopup.rowId;
    updateLocalRow(rowId, { contactStatus: value });
    statusEditPopup = { ...statusEditPopup, currentValue: value };
    closeStatusPopup();
    await persistUpdate(rowId, { contactStatus: value });
  }

  // ===========================
  // Notes popup
  // ===========================
  function openNotesEditPopup(row: CrmRow) {
    notesEditPopup = {
      open: true,
      rowId: row.id,
      contactName: row.fullName || "—",
      value: row.notes || "",
    };
  }

  async function saveNotesPopup() {
    if (!notesEditPopup.rowId) return;
    const rowId = notesEditPopup.rowId;
    const value = notesEditPopup.value.trim() || null;
    updateLocalRow(rowId, { notes: value });
    closeNotesPopup();
    await persistUpdate(rowId, { notes: value });
  }

  // ===========================
  // Next step popup (label + date)
  // ===========================
  function openNextStepEditPopup(row: CrmRow) {
    nextStepEditPopup = {
      open: true,
      rowId: row.id,
      contactName: row.fullName || "—",
      labelValue: row.nextStep || "",
      dateValue: toISODateInputValue(row.nextStepAt),
    };
  }

  function pickNextStepLabel(value: string) {
    nextStepEditPopup = { ...nextStepEditPopup, labelValue: value };
  }

  async function saveNextStepPopup() {
    if (!nextStepEditPopup.rowId) return;
    const rowId = nextStepEditPopup.rowId;
    const label = nextStepEditPopup.labelValue.trim() || null;
    const iso = nextStepEditPopup.dateValue
      ? new Date(nextStepEditPopup.dateValue).toISOString()
      : null;
    updateLocalRow(rowId, { nextStep: label, nextStepAt: iso });
    closeNextStepPopup();
    await persistUpdate(rowId, { nextStep: label, nextStepAt: iso });
  }

  async function clearNextStepPopup() {
    if (!nextStepEditPopup.rowId) return;
    const rowId = nextStepEditPopup.rowId;
    updateLocalRow(rowId, { nextStep: null, nextStepAt: null });
    closeNextStepPopup();
    await persistUpdate(rowId, { nextStep: null, nextStepAt: null });
  }

  // ===========================
  // Column renderers
  // ===========================
  function fullNameRenderer(params: ICellRendererParams<CrmRow>) {
    const name = (params.value as string | null) || "—";
    const row = params.data;
    const div = document.createElement("div");
    div.style.cssText =
      "display:flex;align-items:center;gap:10px;height:100%;min-width:0;";

    const avatar = document.createElement("div");
    avatar.style.cssText =
      "width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:0.75rem;flex-shrink:0;";
    avatar.textContent = (name || "?")[0].toUpperCase();
    div.appendChild(avatar);

    if (row?.listId) {
      const link = document.createElement("a");
      link.href = `/lists/${row.listId}`;
      link.style.cssText =
        "font-weight:600;font-size:0.875rem;color:#111827;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      link.textContent = name;
      link.addEventListener("mouseenter", () => {
        link.style.textDecoration = "underline";
      });
      link.addEventListener("mouseleave", () => {
        link.style.textDecoration = "none";
      });
      link.addEventListener("click", (e) => e.stopPropagation());
      div.appendChild(link);
    } else {
      const span = document.createElement("span");
      span.style.cssText =
        "font-weight:600;font-size:0.875rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      span.textContent = name;
      div.appendChild(span);
    }

    return div;
  }

  function contactRenderer(params: ICellRendererParams<CrmRow>) {
    const row = params.data;
    if (!row) return "";

    const email = row.email || row.email2;
    const phone = row.phone1 || row.phone2;

    if (!email && !phone) {
      const span = document.createElement("span");
      span.style.cssText =
        "color:#9ca3af;font-size:0.8125rem;font-style:italic;";
      span.textContent = "—";
      return span;
    }

    const container = document.createElement("div");
    container.style.cssText =
      "display:flex;flex-direction:column;line-height:1.2;gap:3px;min-width:0;";

    if (email) {
      const emailLink = document.createElement("a");
      emailLink.href = `mailto:${email}`;
      emailLink.title = email;
      emailLink.style.cssText =
        "display:inline-flex;align-items:center;gap:5px;font-size:0.8125rem;color:#1f2937;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      emailLink.innerHTML =
        '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>';
      const span = document.createElement("span");
      span.textContent = email;
      span.style.cssText =
        "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      emailLink.appendChild(span);
      emailLink.addEventListener("click", (e) => e.stopPropagation());
      emailLink.addEventListener("mouseenter", () => {
        emailLink.style.textDecoration = "underline";
      });
      emailLink.addEventListener("mouseleave", () => {
        emailLink.style.textDecoration = "none";
      });
      container.appendChild(emailLink);
    }

    if (phone) {
      const phoneLink = document.createElement("a");
      phoneLink.href = `tel:${phone}`;
      phoneLink.title = phone;
      phoneLink.style.cssText =
        "display:inline-flex;align-items:center;gap:5px;font-size:0.8125rem;color:#1f2937;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      phoneLink.innerHTML =
        '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
      const span = document.createElement("span");
      span.textContent = phone;
      span.style.cssText =
        "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      phoneLink.appendChild(span);
      phoneLink.addEventListener("click", (e) => e.stopPropagation());
      phoneLink.addEventListener("mouseenter", () => {
        phoneLink.style.textDecoration = "underline";
      });
      phoneLink.addEventListener("mouseleave", () => {
        phoneLink.style.textDecoration = "none";
      });
      container.appendChild(phoneLink);
    }

    return container;
  }

  function linkedinRenderer(params: ICellRendererParams<CrmRow>) {
    const url = params.value as string | null;
    if (!url) {
      const span = document.createElement("span");
      span.style.color = "#9ca3af";
      span.textContent = "—";
      return span;
    }
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = url;
    link.style.cssText =
      "display:inline-flex;align-items:center;gap:4px;color:#0a66c2;font-size:0.8125rem;text-decoration:none;";
    link.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>';
    const text = document.createElement("span");
    text.textContent = "Profil";
    link.appendChild(text);
    link.addEventListener("click", (e) => e.stopPropagation());
    return link;
  }

  function companyLinkedinSearchUrl(companyName: string | null): string {
    const name = (companyName || "").trim();
    if (!name) return "https://www.linkedin.com/";
    return `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(name)}`;
  }

  function companyRenderer(params: ICellRendererParams<CrmRow>) {
    const row = params.data;
    if (!row) return "";
    const div = document.createElement("div");
    div.style.cssText =
      "display:flex;align-items:center;gap:8px;height:100%;min-width:0;cursor:pointer;";
    div.title = `Voir la fiche entreprise : ${row.companyName || ""}`;

    const avatar = document.createElement("div");
    avatar.style.cssText =
      "width:26px;height:26px;border-radius:6px;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:0.75rem;flex-shrink:0;";
    avatar.textContent = (row.companyName || "?")[0].toUpperCase();
    div.appendChild(avatar);

    const name = document.createElement("span");
    name.style.cssText =
      "font-size:0.8125rem;font-weight:500;color:#1f2937;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1;";
    name.textContent = row.companyName || "—";
    div.appendChild(name);

    // Keep a quick way to jump to LinkedIn's company search without hijacking
    // the cell click (which now opens the company sheet).
    const link = document.createElement("a");
    link.href = companyLinkedinSearchUrl(row.companyName);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = `Chercher ${row.companyName || "l'entreprise"} sur LinkedIn`;
    link.style.cssText =
      "display:inline-flex;align-items:center;flex-shrink:0;padding:2px;border-radius:4px;";
    link.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="#0a66c2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`;
    link.addEventListener("click", (e) => e.stopPropagation());
    div.appendChild(link);

    return div;
  }

  function offerRenderer(params: ICellRendererParams<CrmRow>) {
    const row = params.data;
    if (!row) return "";
    const title = row.offerTitle || "(Sans titre)";
    const wrapper = document.createElement("div");
    wrapper.style.cssText =
      "display:flex;align-items:center;gap:6px;height:100%;min-width:0;cursor:pointer;";
    wrapper.title = `Voir la fiche entreprise : ${row.companyName || title}`;

    const text = document.createElement("span");
    text.style.cssText =
      "font-size:0.8125rem;font-weight:500;color:#1f2937;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1;";
    text.textContent = title;
    wrapper.appendChild(text);

    // External-link icon keeps the "open the source URL" affordance without
    // hijacking the cell click, which now opens the company sheet.
    if (row.offerUrl) {
      const ext = document.createElement("a");
      ext.href = row.offerUrl;
      ext.target = "_blank";
      ext.rel = "noopener noreferrer";
      ext.title = "Ouvrir l'URL de l'offre";
      ext.style.cssText =
        "display:inline-flex;align-items:center;color:#6366f1;flex-shrink:0;padding:2px;border-radius:4px;";
      ext.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
      ext.addEventListener("click", (e) => e.stopPropagation());
      wrapper.appendChild(ext);
    }

    return wrapper;
  }

  function makeDateRenderer(field: DateField) {
    return (params: ICellRendererParams<CrmRow>) => {
      const iso = params.data?.[field] as string | null | undefined;
      const wrapper = document.createElement("div");
      wrapper.style.cssText =
        "display:flex;align-items:center;gap:6px;height:100%;min-width:0;cursor:pointer;";

      if (!iso) {
        const span = document.createElement("span");
        span.style.cssText =
          "color:#9ca3af;font-size:0.8125rem;font-style:italic;";
        span.textContent = "—";
        wrapper.appendChild(span);
      } else if (field === "nextStepAt") {
        const today = isToday(iso);
        const span = document.createElement("span");
        span.style.cssText = `font-size:0.8125rem;font-weight:${today ? "600" : "500"};color:${today ? "#b45309" : "#111827"};${today ? "background:#fef3c7;border-radius:6px;padding:2px 8px;" : ""}`;
        span.textContent = formatDate(iso);
        wrapper.appendChild(span);
      } else {
        const span = document.createElement("span");
        span.style.cssText = "font-size:0.8125rem;color:#111827;";
        span.textContent = formatDate(iso);
        wrapper.appendChild(span);
      }

      const editIcon = document.createElement("span");
      editIcon.style.cssText = "color:#9ca3af;display:inline-flex;flex-shrink:0;";
      editIcon.innerHTML =
        '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
      wrapper.appendChild(editIcon);

      return wrapper;
    };
  }

  function nextStepRenderer(params: ICellRendererParams<CrmRow>) {
    const row = params.data;
    const wrapper = document.createElement("div");
    wrapper.style.cssText =
      "display:flex;align-items:center;gap:6px;height:100%;min-width:0;cursor:pointer;";

    if (!row) return wrapper;

    const opt = resolveNextStepLabel(row.nextStep);
    const iso = row.nextStepAt;

    if (!opt && !iso) {
      const span = document.createElement("span");
      span.style.cssText =
        "display:inline-flex;align-items:center;gap:4px;color:#9ca3af;font-size:0.8125rem;font-style:italic;";
      span.innerHTML =
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg><span>Ajouter…</span>';
      wrapper.appendChild(span);
      return wrapper;
    }

    if (opt) {
      const pill = document.createElement("span");
      pill.style.cssText = `display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:9999px;font-size:0.75rem;font-weight:500;background:${opt.bg};color:${opt.fg};max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
      pill.title = opt.label;
      pill.textContent = `${opt.emoji ? opt.emoji + " " : ""}${opt.label}`.trim();
      wrapper.appendChild(pill);
    }

    if (iso) {
      const today = isToday(iso);
      const dateSpan = document.createElement("span");
      dateSpan.style.cssText = `font-size:0.8125rem;font-weight:${today ? "600" : "500"};color:${today ? "#b45309" : "#6b7280"};${today ? "background:#fef3c7;border-radius:6px;padding:2px 8px;" : ""}flex-shrink:0;`;
      dateSpan.textContent = formatDate(iso);
      wrapper.appendChild(dateSpan);
    }

    return wrapper;
  }

  function notesRenderer(params: ICellRendererParams<CrmRow>) {
    const notes = (params.data?.notes as string | null) || "";
    const wrapper = document.createElement("div");
    wrapper.style.cssText =
      "display:flex;align-items:center;gap:6px;height:100%;min-width:0;cursor:pointer;";

    if (!notes) {
      const icon = document.createElement("span");
      icon.style.cssText =
        "display:inline-flex;align-items:center;gap:4px;color:#9ca3af;font-size:0.8125rem;font-style:italic;";
      icon.innerHTML =
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg><span>Ajouter…</span>';
      wrapper.appendChild(icon);
      return wrapper;
    }

    const text = document.createElement("span");
    text.style.cssText =
      "font-size:0.8125rem;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;max-width:100%;";
    text.title = notes;
    text.textContent = notes;
    wrapper.appendChild(text);

    return wrapper;
  }

  function statusRenderer(params: ICellRendererParams<CrmRow>) {
    const opt = resolveStatus(params.value as string | null);
    const wrapper = document.createElement("div");
    wrapper.style.cssText =
      "display:flex;align-items:center;gap:6px;height:100%;cursor:pointer;";
    const pill = document.createElement("span");
    pill.style.cssText =
      "display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:9999px;font-size:0.75rem;font-weight:500;";
    pill.className = opt.color;
    pill.textContent = `${opt.emoji ? opt.emoji + " " : ""}${opt.label}`.trim();
    wrapper.appendChild(pill);

    const caret = document.createElement("span");
    caret.style.cssText = "color:#9ca3af;display:inline-flex;";
    caret.innerHTML =
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
    wrapper.appendChild(caret);
    return wrapper;
  }

  // ===========================
  // Column defs
  // ===========================
  const columnDefs: ColDef<CrmRow>[] = [
    {
      field: "fullName",
      headerName: "Nom prénom",
      width: 220,
      pinned: "left",
      cellRenderer: fullNameRenderer,
      filter: "agTextColumnFilter",
    },
    {
      field: "linkedinUrl",
      headerName: "LinkedIn",
      width: 110,
      cellRenderer: linkedinRenderer,
      sortable: false,
      filter: false,
    },
    {
      colId: "contact",
      headerName: "Contact",
      width: 230,
      valueGetter: (params) =>
        [
          params.data?.email,
          params.data?.email2,
          params.data?.phone1,
          params.data?.phone2,
        ]
          .filter(Boolean)
          .join(" "),
      cellRenderer: contactRenderer,
      filter: "agTextColumnFilter",
      sortable: false,
    },
    {
      field: "companyName",
      headerName: "Entreprise",
      width: 180,
      cellRenderer: companyRenderer,
      filter: "agTextColumnFilter",
    },
    {
      field: "offerTitle",
      headerName: "Offre",
      width: 180,
      cellRenderer: offerRenderer,
      filter: "agTextColumnFilter",
    },
    {
      field: "emailSentAt",
      headerName: "Email envoyé",
      width: 160,
      cellRenderer: makeDateRenderer("emailSentAt"),
      filter: "agDateColumnFilter",
      valueGetter: (p) => p.data?.emailSentAt ?? null,
    },
    {
      field: "linkedinSentAt",
      headerName: "LinkedIn envoyé",
      width: 170,
      cellRenderer: makeDateRenderer("linkedinSentAt"),
      filter: "agDateColumnFilter",
      valueGetter: (p) => p.data?.linkedinSentAt ?? null,
    },
    {
      field: "whatsappSentAt",
      headerName: "WhatsApp envoyé",
      width: 170,
      cellRenderer: makeDateRenderer("whatsappSentAt"),
      filter: "agDateColumnFilter",
      valueGetter: (p) => p.data?.whatsappSentAt ?? null,
    },
    {
      field: "calledAt",
      headerName: "Appel",
      width: 140,
      cellRenderer: makeDateRenderer("calledAt"),
      filter: "agDateColumnFilter",
      valueGetter: (p) => p.data?.calledAt ?? null,
    },
    {
      colId: "nextStep",
      headerName: "Next step",
      width: 230,
      cellRenderer: nextStepRenderer,
      valueGetter: (p) =>
        [p.data?.nextStep, p.data?.nextStepAt].filter(Boolean).join(" "),
      filter: "agTextColumnFilter",
      sortable: true,
      comparator: (_a, _b, nodeA, nodeB) => {
        const dA = nodeA.data?.nextStepAt
          ? new Date(nodeA.data.nextStepAt).getTime()
          : Number.POSITIVE_INFINITY;
        const dB = nodeB.data?.nextStepAt
          ? new Date(nodeB.data.nextStepAt).getTime()
          : Number.POSITIVE_INFINITY;
        return dA - dB;
      },
    },
    {
      field: "contactStatus",
      headerName: "Situation",
      width: 180,
      cellRenderer: statusRenderer,
      filter: "agSetColumnFilter",
    },
    {
      field: "notes",
      headerName: "Commentaire",
      flex: 1,
      minWidth: 220,
      cellRenderer: notesRenderer,
      filter: "agTextColumnFilter",
      sortable: false,
    },
    {
      colId: "actions",
      headerName: "",
      width: 48,
      pinned: "right" as const,
      sortable: false,
      filter: false,
      resizable: false,
      cellRenderer: (params: { data?: CrmRow }) => {
        const row = params.data;
        if (!row) return null;
        const btn = document.createElement("button");
        btn.title = "Retirer du CRM";
        btn.style.cssText =
          "display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:6px;border:1px solid #fecaca;color:#ef4444;background:transparent;cursor:pointer;transition:background 0.15s;";
        btn.innerHTML =
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>';
        btn.addEventListener("mouseenter", () => { btn.style.background = "#fef2f2"; });
        btn.addEventListener("mouseleave", () => { btn.style.background = "transparent"; });
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          removeFromCrm(row);
        });
        return btn;
      },
    },
  ];

  const DATE_FIELDS = new Set<string>([
    "emailSentAt",
    "linkedinSentAt",
    "whatsappSentAt",
    "calledAt",
  ]);

  function isRdvScheduled(row: CrmRow | undefined | null): boolean {
    if (!row) return false;
    if ((row.contactStatus || "").trim().toLowerCase() === "rdv_pris") return true;
    return (row.nextStep || "").trim().toLowerCase() === "organiser rdv";
  }

  function isNextStepOverdue(iso: string | null | undefined): boolean {
    if (!iso) return false;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextStep = new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
    );
    return nextStep.getTime() < today.getTime();
  }

  function needsAction(row: CrmRow | undefined | null): boolean {
    if (!row) return false;
    if (isTerminalStatus(row.contactStatus)) return false;
    if (isRdvScheduled(row)) return false;
    if (isNextStepOverdue(row.nextStepAt)) return true;
    // No follow-up planned: no call AND no scheduled next step
    return !row.calledAt && !row.nextStepAt;
  }

  function lastSentAtMs(row: CrmRow): number {
    const dates = [
      row.emailSentAt,
      row.linkedinSentAt,
      row.whatsappSentAt,
    ].map((d) => (d ? new Date(d).getTime() : 0));
    return Math.max(0, ...dates);
  }

  // Reactive sort: "to handle" (red) rows float to the top after every local
  // mutation. Secondary tie-breaker = most recent send across any channel.
  const sortedRows = $derived(
    [...rows].sort((a, b) => {
      const pa = needsAction(a) ? 0 : 1;
      const pb = needsAction(b) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return lastSentAtMs(b) - lastSentAtMs(a);
    }),
  );

  const gridOptions: GridOptions<CrmRow> = {
    defaultColDef: { resizable: true, sortable: true, filter: true },
    columnDefs,
    rowHeight: 52,
    getRowId: (params) => params.data.id,
    rowClassRules: {
      "crm-row-green": (params) => isRdvScheduled(params.data),
      "crm-row-red": (params) =>
        !isRdvScheduled(params.data) && needsAction(params.data),
    },
    onCellClicked: (event: CellClickedEvent<CrmRow>) => {
      const colId = event.colDef.colId || event.colDef.field;
      if (!colId || !event.data) return;
      // Ignore clicks that landed on nested links/buttons inside a cell
      // (e.g. the "open URL" icon in the offer cell, the LinkedIn search icon
      // in the company cell). Those handlers already stopPropagation, so the
      // guard here is belt-and-suspenders.
      const target = event.event?.target as HTMLElement | undefined;
      if (target?.closest("a")) return;

      if (DATE_FIELDS.has(colId)) {
        openDateEditPopup(event.data, colId as DateField);
      } else if (colId === "nextStep") {
        openNextStepEditPopup(event.data);
      } else if (colId === "contactStatus") {
        openStatusEditPopup(event.data);
      } else if (colId === "notes") {
        openNotesEditPopup(event.data);
      } else if (colId === "offerTitle" || colId === "companyName") {
        if (event.data.companyName) {
          companySheetName = event.data.companyName;
        }
      }
    },
  };
</script>

<div class="crm-root">
  <div class="crm-toolbar">
    <div class="flex items-center gap-2 flex-1">
      <div class="relative flex-1 max-w-sm">
        <svg
          class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input
          type="text"
          placeholder="Rechercher un contact, une offre…"
          bind:value={quickFilter}
          class="w-full pl-8 pr-3 py-1.5 border border-input rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <span class="text-sm text-muted-foreground">
        {rows.length} contact{rows.length !== 1 ? "s" : ""}
      </span>
    </div>
    <button
      type="button"
      onclick={loadCrm}
      class="inline-flex items-center gap-1.5 px-3 py-1.5 border border-input rounded-md text-sm hover:bg-accent transition-colors"
      title="Rafraîchir"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class={loading ? "animate-spin" : ""}
      >
        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
        <path d="M21 3v5h-5"></path>
        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
        <path d="M8 16H3v5"></path>
      </svg>
      Actualiser
    </button>
  </div>

  <div class="crm-grid">
    <AgGrid
      rowData={sortedRows}
      {gridOptions}
      quickFilterText={quickFilter}
      enableRowSelection={false}
      nbRows={25}
      gridStyle="height: 100%; width: 100%;"
    />
  </div>
</div>

<!-- =======================
     Date edit popup
     ======================= -->
{#if dateEditPopup.open}
  <div
    class="popup-backdrop"
    role="button"
    tabindex="-1"
    onclick={closeDatePopup}
    onkeydown={(e) => e.key === "Escape" && closeDatePopup()}
    aria-label="Fermer"
  ></div>
  <div class="popup" role="dialog" aria-modal="true">
    <div class="popup-header">
      <div>
        <div class="popup-title">
          {dateEditPopup.field ? DATE_META[dateEditPopup.field].label : ""}
        </div>
        <div class="popup-subtitle">{dateEditPopup.contactName}</div>
      </div>
      <button
        type="button"
        onclick={closeDatePopup}
        class="text-muted-foreground hover:text-foreground p-1 rounded"
        aria-label="Fermer"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
    <div class="popup-body">
      <label class="popup-label" for="crm-date-input">Date</label>
      <input
        id="crm-date-input"
        type="date"
        bind:value={dateEditPopup.dateValue}
        class="popup-input"
      />

      {#if dateEditPopup.channel}
        <div class="popup-section">
          <div class="popup-label-row">
            <span class="popup-label">Message envoyé</span>
            {#if dateEditPopup.recipient}
              <span class="popup-meta">→ {dateEditPopup.recipient}</span>
            {/if}
          </div>
          {#if dateEditPopup.messageLoading}
            <div class="popup-message popup-message-muted">Chargement…</div>
          {:else if dateEditPopup.message}
            <pre class="popup-message">{dateEditPopup.message}</pre>
          {:else}
            <div class="popup-message popup-message-muted">
              Aucun message trouvé pour ce canal.
            </div>
          {/if}
        </div>
      {/if}
    </div>
    <div class="popup-footer">
      <button
        type="button"
        onclick={clearDatePopup}
        class="btn-ghost"
        disabled={!dateEditPopup.dateValue}
      >
        Effacer
      </button>
      <div class="flex gap-2">
        <button type="button" onclick={closeDatePopup} class="btn-secondary">
          Annuler
        </button>
        <button type="button" onclick={saveDatePopup} class="btn-primary">
          Enregistrer
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- =======================
     Status edit popup
     ======================= -->
{#if statusEditPopup.open}
  <div
    class="popup-backdrop"
    role="button"
    tabindex="-1"
    onclick={closeStatusPopup}
    onkeydown={(e) => e.key === "Escape" && closeStatusPopup()}
    aria-label="Fermer"
  ></div>
  <div class="popup popup-sm" role="dialog" aria-modal="true">
    <div class="popup-header">
      <div>
        <div class="popup-title">Situation</div>
        <div class="popup-subtitle">{statusEditPopup.contactName}</div>
      </div>
      <button
        type="button"
        onclick={closeStatusPopup}
        class="text-muted-foreground hover:text-foreground p-1 rounded"
        aria-label="Fermer"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
    <div class="popup-body status-grid">
      {#each STATUS_OPTIONS as opt}
        {@const isCurrent = statusEditPopup.currentValue === opt.value}
        <button
          type="button"
          class={`status-option ${opt.color} ${isCurrent ? "is-current" : ""}`}
          onclick={() => pickStatus(opt.value)}
        >
          <span class="status-option-label">
            {#if opt.emoji}<span class="status-emoji">{opt.emoji}</span>{/if}
            {opt.label}
          </span>
          {#if isCurrent}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          {/if}
        </button>
      {/each}
    </div>
  </div>
{/if}

<!-- =======================
     Next step edit popup (label + date)
     ======================= -->
{#if nextStepEditPopup.open}
  <div
    class="popup-backdrop"
    role="button"
    tabindex="-1"
    onclick={closeNextStepPopup}
    onkeydown={(e) => e.key === "Escape" && closeNextStepPopup()}
    aria-label="Fermer"
  ></div>
  <div class="popup" role="dialog" aria-modal="true">
    <div class="popup-header">
      <div>
        <div class="popup-title">Next step</div>
        <div class="popup-subtitle">{nextStepEditPopup.contactName}</div>
      </div>
      <button
        type="button"
        onclick={closeNextStepPopup}
        class="text-muted-foreground hover:text-foreground p-1 rounded"
        aria-label="Fermer"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
    <div class="popup-body">
      <div>
        <label class="popup-label" for="crm-next-step-label-input">Action</label>
        <div class="next-step-tags">
          {#each NEXT_STEP_LABELS as opt}
            {@const isCurrent =
              nextStepEditPopup.labelValue.trim().toLowerCase() ===
              opt.value.toLowerCase()}
            <button
              type="button"
              class="next-step-tag {isCurrent ? 'is-current' : ''}"
              style="background:{opt.bg};color:{opt.fg};"
              onclick={() => pickNextStepLabel(opt.value)}
            >
              {#if opt.emoji}<span class="status-emoji">{opt.emoji}</span
                >{/if}{opt.label}
            </button>
          {/each}
          <button
            type="button"
            class="next-step-tag next-step-tag-empty {nextStepEditPopup.labelValue.trim() ===
            ''
              ? 'is-current'
              : ''}"
            onclick={() => pickNextStepLabel("")}
          >
            vide
          </button>
        </div>

        <input
          id="crm-next-step-label-input"
          type="text"
          bind:value={nextStepEditPopup.labelValue}
          placeholder="Ou écris une action personnalisée…"
          class="popup-input"
          style="margin-top:10px;"
        />
      </div>

      <div>
        <label class="popup-label" for="crm-next-step-date-input">Date</label>
        <input
          id="crm-next-step-date-input"
          type="date"
          bind:value={nextStepEditPopup.dateValue}
          class="popup-input"
        />
      </div>
    </div>
    <div class="popup-footer">
      <button
        type="button"
        onclick={clearNextStepPopup}
        class="btn-ghost"
        disabled={!nextStepEditPopup.labelValue && !nextStepEditPopup.dateValue}
      >
        Effacer
      </button>
      <div class="flex gap-2">
        <button type="button" onclick={closeNextStepPopup} class="btn-secondary">
          Annuler
        </button>
        <button type="button" onclick={saveNextStepPopup} class="btn-primary">
          Enregistrer
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- =======================
     Notes edit popup
     ======================= -->
{#if notesEditPopup.open}
  <div
    class="popup-backdrop"
    role="button"
    tabindex="-1"
    onclick={closeNotesPopup}
    onkeydown={(e) => e.key === "Escape" && closeNotesPopup()}
    aria-label="Fermer"
  ></div>
  <div class="popup" role="dialog" aria-modal="true">
    <div class="popup-header">
      <div>
        <div class="popup-title">Commentaire</div>
        <div class="popup-subtitle">{notesEditPopup.contactName}</div>
      </div>
      <button
        type="button"
        onclick={closeNotesPopup}
        class="text-muted-foreground hover:text-foreground p-1 rounded"
        aria-label="Fermer"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
    <div class="popup-body">
      <label class="popup-label" for="crm-notes-input">Notes internes</label>
      <textarea
        id="crm-notes-input"
        bind:value={notesEditPopup.value}
        placeholder="Écris un commentaire à propos de ce contact…"
        rows="7"
        class="popup-textarea"
      ></textarea>
    </div>
    <div class="popup-footer">
      <div></div>
      <div class="flex gap-2">
        <button type="button" onclick={closeNotesPopup} class="btn-secondary">
          Annuler
        </button>
        <button type="button" onclick={saveNotesPopup} class="btn-primary">
          Enregistrer
        </button>
      </div>
    </div>
  </div>
{/if}

{#if companySheetName}
  <CompanySheet
    companyName={companySheetName}
    onClose={() => (companySheetName = null)}
    onOfferClick={(offer) => {
      // Jump into the offer's list page, pre-opening the OfferSheet via ?offer=.
      window.open(`/lists/${offer.listId}?offer=${offer.id}`, "_blank");
    }}
  />
{/if}

<style>
  .crm-root {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .crm-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .crm-grid {
    height: 70vh;
    width: 100%;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    overflow: hidden;
    background: white;
  }

  .popup-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    z-index: 60;
  }

  .popup {
    position: fixed;
    z-index: 61;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(520px, 92vw);
    max-height: 80vh;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 14px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .popup-sm {
    width: min(380px, 92vw);
  }

  .popup-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 18px;
    border-bottom: 1px solid #e5e7eb;
    background: #f9fafb;
  }

  .popup-title {
    font-size: 0.95rem;
    font-weight: 600;
    color: #111827;
  }

  .popup-subtitle {
    font-size: 0.75rem;
    color: #6b7280;
    margin-top: 2px;
  }

  .popup-body {
    padding: 18px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .popup-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 18px;
    border-top: 1px solid #e5e7eb;
    background: #f9fafb;
  }

  .popup-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .popup-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
  }

  .popup-meta {
    font-size: 0.75rem;
    color: #9ca3af;
  }

  .popup-input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 0.9rem;
    outline: none;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }

  .popup-input:focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
  }

  .popup-textarea {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 0.9rem;
    outline: none;
    resize: vertical;
    min-height: 140px;
    font-family: inherit;
    line-height: 1.5;
    color: #111827;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }

  .popup-textarea:focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
  }

  .popup-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .popup-message {
    font-family:
      ui-sans-serif,
      system-ui,
      -apple-system,
      "Segoe UI",
      Roboto,
      sans-serif;
    font-size: 0.875rem;
    color: #1f2937;
    white-space: pre-wrap;
    word-wrap: break-word;
    margin: 0;
    padding: 12px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    max-height: 260px;
    overflow: auto;
  }

  .popup-message-muted {
    color: #9ca3af;
    font-style: italic;
  }

  .btn-primary,
  .btn-secondary,
  .btn-ghost {
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s,
      color 0.15s,
      opacity 0.15s;
    border: 1px solid transparent;
  }

  .btn-primary {
    background: #4f46e5;
    color: white;
  }

  .btn-primary:hover {
    background: #4338ca;
  }

  .btn-secondary {
    background: white;
    border-color: #d1d5db;
    color: #374151;
  }

  .btn-secondary:hover {
    background: #f3f4f6;
  }

  .btn-ghost {
    background: transparent;
    color: #6b7280;
  }

  .btn-ghost:hover:not(:disabled) {
    background: #f3f4f6;
    color: #374151;
  }

  .btn-ghost:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .status-grid {
    gap: 8px;
  }

  .status-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    border-radius: 10px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid rgba(0, 0, 0, 0.04);
    transition:
      transform 0.08s,
      box-shadow 0.15s;
    text-align: left;
    width: 100%;
  }

  .status-option:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
  }

  .status-option.is-current {
    outline: 2px solid #4f46e5;
    outline-offset: 1px;
  }

  .status-option-label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .status-emoji {
    font-size: 1.05em;
    line-height: 1;
  }

  :global(.ag-row .ag-cell[col-id="fullName"] a:hover) {
    text-decoration: underline;
  }

  /* Smoother vertical reposition when rows are re-sorted. */
  :global(.ag-row) {
    transition:
      transform 650ms cubic-bezier(0.22, 1, 0.36, 1),
      background-color 450ms ease;
  }

  :global(.ag-row .ag-cell) {
    transition: background-color 450ms ease;
  }

  :global(.ag-row.crm-row-red),
  :global(.ag-row.crm-row-red .ag-cell) {
    background-color: #fee2e2 !important;
  }

  :global(.ag-row.crm-row-red.ag-row-hover),
  :global(.ag-row.crm-row-red.ag-row-hover .ag-cell) {
    background-color: #fecaca !important;
  }

  :global(.ag-row.crm-row-green),
  :global(.ag-row.crm-row-green .ag-cell) {
    background-color: #dcfce7 !important;
  }

  :global(.ag-row.crm-row-green.ag-row-hover),
  :global(.ag-row.crm-row-green.ag-row-hover .ag-cell) {
    background-color: #bbf7d0 !important;
  }

  .next-step-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
  }

  .next-step-tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 12px;
    border-radius: 9999px;
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid rgba(0, 0, 0, 0.04);
    transition:
      transform 0.08s,
      box-shadow 0.15s,
      opacity 0.15s;
  }

  .next-step-tag:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  }

  .next-step-tag.is-current {
    outline: 2px solid #4f46e5;
    outline-offset: 1px;
  }

  .next-step-tag-empty {
    background: #f3f4f6;
    color: #6b7280;
  }
</style>
