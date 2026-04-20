<script lang="ts">
  import { toast } from "svelte-sonner";
  import {
    STATUS_OPTIONS,
    DEFAULT_STATUS,
    resolveStatus,
  } from "$lib/constants/contactStatus";

  type Contact = {
    id: string;
    offerId: string;
    linkedinUrl: string | null;
    phone1: string | null;
    phone2: string | null;
    email: string | null;
    fullName: string | null;
    jobTitle: string | null;
    linkedinData: Record<string, unknown> | null;
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
    contact,
    onClose,
    onEnrich,
    onGenerateMessage,
    onContactUpdated,
  }: {
    contact: Contact;
    onClose: () => void;
    onEnrich?: (contact: Contact) => void;
    onGenerateMessage?: (contact: Contact) => void;
    onContactUpdated?: (updated: Contact) => void;
  } = $props();

  let activeTab = $state<"profil" | "message" | "notes">("profil");
  let editableMessage = $state(contact.aiMessage || "");
  let editableNotes = $state(contact.notes || "");
  let savingMessage = $state(false);
  let savingNotes = $state(false);

  // Keep local values in sync when contact changes
  $effect(() => {
    editableMessage = contact.aiMessage || "";
    editableNotes = contact.notes || "";
  });

  // =====================
  // LinkedIn data helpers
  // =====================
  const profile = $derived(contact.linkedinData as Record<string, unknown> | null);

  const firstName = $derived(
    (profile?.first_name as string) || contact.fullName?.split(" ")[0] || ""
  );
  const lastName = $derived(
    (profile?.last_name as string) || contact.fullName?.split(" ").slice(1).join(" ") || ""
  );
  const fullName = $derived(
    contact.fullName || `${firstName} ${lastName}`.trim() || "Nom inconnu"
  );
  const headline = $derived(
    (profile?.headline as string) || contact.jobTitle || ""
  );
  const location = $derived(
    (profile?.location as string) ||
    (profile?.geo_location as string) ||
    (profile?.country as string) ||
    ""
  );
  const profilePicture = $derived(
    (profile?.profile_picture_url as string) ||
    (profile?.picture_url as string) ||
    (profile?.photo_url as string) ||
    ""
  );
  const connectionsCount = $derived(
    (profile?.connections_count as number) ||
    (profile?.followers_count as number) ||
    null
  );
  const summary = $derived((profile?.summary as string) || (profile?.about as string) || "");

  const experiences = $derived(() => {
    const raw =
      (profile?.experience as unknown[]) ||
      (profile?.experiences as unknown[]) ||
      (profile?.positions as unknown[]) ||
      [];
    return raw.slice(0, 10).map((e) => {
      const exp = e as Record<string, unknown>;
      return {
        title: (exp.title as string) || (exp.position as string) || (exp.role as string) || "",
        company:
          (exp.company as string) ||
          (exp.company_name as string) ||
          ((exp.company as Record<string, unknown>)?.name as string) ||
          "",
        companyLogo:
          (exp.company_logo_url as string) ||
          ((exp.company as Record<string, unknown>)?.logo_url as string) ||
          "",
        dateFrom:
          (exp.date_from as string) ||
          (exp.start_date as string) ||
          (exp.from_date as string) ||
          "",
        dateTo:
          (exp.date_to as string) ||
          (exp.end_date as string) ||
          (exp.to_date as string) ||
          "",
        description: (exp.description as string) || "",
        isCurrent:
          (exp.is_current as boolean) ||
          !(exp.date_to as string) ||
          (exp.end_date as string) === null,
      };
    });
  });

  const education = $derived(() => {
    const raw =
      (profile?.education as unknown[]) ||
      (profile?.educations as unknown[]) ||
      [];
    return raw.slice(0, 6).map((e) => {
      const edu = e as Record<string, unknown>;
      return {
        school:
          (edu.school as string) ||
          (edu.institution as string) ||
          (edu.institution_name as string) ||
          ((edu.school as Record<string, unknown>)?.name as string) ||
          "",
        degree:
          (edu.degree as string) ||
          (edu.field_of_study as string) ||
          (edu.degree_name as string) ||
          "",
        dateFrom:
          (edu.date_from as string) ||
          (edu.start_date as string) ||
          (String(edu.date_from_year as number) ?? ""),
        dateTo:
          (edu.date_to as string) ||
          (edu.end_date as string) ||
          (String(edu.date_to_year as number) ?? ""),
        description: (edu.description as string) || "",
      };
    });
  });

  const skills = $derived(() => {
    const raw = (profile?.skills as unknown[]) || [];
    return raw
      .slice(0, 20)
      .map((s) => {
        const skill = s as Record<string, unknown>;
        return (skill.name as string) || (typeof s === "string" ? s : "");
      })
      .filter(Boolean);
  });

  function formatPeriod(from: string, to: string, isCurrent: boolean): string {
    if (!from && !to) return "";
    const fromYear = from ? new Date(from).getFullYear() || from.substring(0, 4) : "";
    const toStr = isCurrent
      ? "Présent"
      : to
        ? new Date(to).getFullYear() || to.substring(0, 4)
        : "Présent";
    return `${fromYear} — ${toStr}`;
  }

  function getInitial(name: string): string {
    return name?.charAt(0).toUpperCase() || "?";
  }

  // =====================
  // Actions
  // =====================
  async function saveMessage() {
    savingMessage = true;
    try {
      const res = await fetch(`/api/contacts/${contact.id}/update-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiMessage: editableMessage }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      onContactUpdated?.({ ...contact, ...updated });
      toast.success("Message sauvegardé");
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      savingMessage = false;
    }
  }

  async function saveNotes() {
    savingNotes = true;
    try {
      const res = await fetch(`/api/contacts/${contact.id}/update-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: editableNotes }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      onContactUpdated?.({ ...contact, ...updated });
      toast.success("Notes sauvegardées");
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      savingNotes = false;
    }
  }

  async function updateStatus(status: string) {
    try {
      const res = await fetch(`/api/contacts/${contact.id}/update-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactStatus: status }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      onContactUpdated?.({ ...contact, ...updated });
      toast.success("Statut mis à jour");
    } catch {
      toast.error("Erreur lors de la mise à jour");
    }
  }

  const statusOptions = STATUS_OPTIONS;

  const currentStatus = $derived(resolveStatus(contact.contactStatus));
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
    <div class="flex gap-4 items-start flex-1 min-w-0">
      <!-- Profile picture or initials -->
      <div class="flex-shrink-0">
        {#if profilePicture}
          <img
            src={profilePicture}
            alt={fullName}
            class="w-16 h-16 rounded-xl object-cover border border-border"
          />
        {:else}
          <div class="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-2xl">
            {getInitial(fullName)}
          </div>
        {/if}
      </div>

      <div class="flex-1 min-w-0 space-y-1">
        <h2 class="text-xl font-bold text-foreground truncate">{fullName}</h2>
        {#if headline}
          <p class="text-sm text-muted-foreground line-clamp-2">{headline}</p>
        {/if}
        <div class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1">
          {#if location}
            <span class="flex items-center gap-1">
              <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/>
              </svg>
              {location}
            </span>
          {/if}
          {#if connectionsCount}
            <span>{connectionsCount}+ relations</span>
          {/if}
          {#if contact.linkedinUrl}
            <a
              href={contact.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="flex items-center gap-1 text-blue-600 hover:underline"
            >
              <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path d="M16.338 16.338H13.67V12.16c0-.995-.017-2.277-1.387-2.277-1.39 0-1.601 1.086-1.601 2.207v4.248H8.014v-8.59h2.559v1.174h.037c.356-.675 1.227-1.387 2.526-1.387 2.703 0 3.203 1.778 3.203 4.092v4.711zM5.005 6.575a1.548 1.548 0 11-.003-3.096 1.548 1.548 0 01.003 3.096zm-1.337 9.763H6.34v-8.59H3.667v8.59zM17.668 1H2.328C1.595 1 1 1.581 1 2.298v15.403C1 18.418 1.595 19 2.328 19h15.34c.734 0 1.332-.582 1.332-1.299V2.298C19 1.581 18.402 1 17.668 1z"/>
              </svg>
              LinkedIn
            </a>
          {/if}
        </div>
      </div>
    </div>

    <button
      onclick={onClose}
      class="ml-4 p-2 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground flex-shrink-0"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  </div>

  <!-- Status + action row -->
  <div class="flex items-center gap-3 px-6 py-3 border-b border-border bg-muted/30 flex-shrink-0 flex-wrap">
    <!-- Status select -->
    <select
      value={contact.contactStatus || DEFAULT_STATUS}
      onchange={(e) => updateStatus((e.target as HTMLSelectElement).value)}
      class="text-xs border border-input rounded px-2 py-1 bg-background cursor-pointer"
    >
      {#each statusOptions as opt}
        <option value={opt.value}>{opt.emoji ? opt.emoji + " " : ""}{opt.label}</option>
      {/each}
    </select>

    <!-- Context info -->
    <span class="text-xs text-muted-foreground">{contact.companyName}</span>
    {#if contact.offerUrl}
      <a href={contact.offerUrl} target="_blank" rel="noopener" class="text-xs text-blue-600 hover:underline">
        🔗 Offre
      </a>
    {/if}

    <div class="flex-1"></div>

    <!-- Action buttons -->
    {#if contact.linkedinUrl}
      <button
        onclick={() => onEnrich?.(contact)}
        class="flex items-center gap-1 text-xs px-2 py-1 border border-input rounded hover:bg-accent transition-colors"
        title="{contact.linkedinSummary ? 'Ré-enrichir' : 'Enrichir'} le profil LinkedIn"
      >
        🔍 {contact.linkedinSummary ? "Ré-enrichir" : "Enrichir"}
      </button>
    {/if}
    <button
      onclick={() => { onGenerateMessage?.(contact); activeTab = "message"; }}
      class="flex items-center gap-1 text-xs px-2 py-1 border border-input rounded hover:bg-accent transition-colors"
      title="Générer un message IA"
    >
      ✨ Générer
    </button>
  </div>

  <!-- Tabs -->
  <div class="flex border-b border-border px-6 flex-shrink-0">
    {#each [["profil", "Profil"], ["message", "Message IA"], ["notes", "Notes"]] as [tab, label]}
      <button
        type="button"
        onclick={() => (activeTab = tab as "profil" | "message" | "notes")}
        class="px-4 py-3 text-sm font-medium transition-colors relative
          {activeTab === tab
            ? 'text-primary border-b-2 border-primary'
            : 'text-muted-foreground hover:text-foreground'}"
      >
        {label}
        {#if tab === "message" && contact.aiMessage}
          <span class="ml-1 inline-flex items-center justify-center w-1.5 h-1.5 rounded-full bg-green-500"></span>
        {/if}
      </button>
    {/each}
  </div>

  <!-- Tab content -->
  <div class="flex-1 overflow-y-auto px-6 py-5 space-y-5">

    <!-- ========== PROFIL TAB ========== -->
    {#if activeTab === "profil"}

      <!-- AI Summary -->
      {#if contact.linkedinSummary}
        <div class="p-4 rounded-lg bg-purple-50 border border-purple-200 dark:bg-purple-950/20 dark:border-purple-800">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-xs font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wide">✨ Résumé IA</span>
          </div>
          <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{contact.linkedinSummary}</p>
        </div>
      {:else if !profile}
        <div class="text-center py-12 text-muted-foreground">
          <div class="text-4xl mb-3">🔍</div>
          <p class="font-medium mb-1">Profil non enrichi</p>
          <p class="text-sm mb-4">Cliquez sur "Enrichir" pour récupérer les données LinkedIn</p>
          {#if contact.linkedinUrl}
            <button
              onclick={() => onEnrich?.(contact)}
              class="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              🔍 Enrichir le profil
            </button>
          {/if}
        </div>
      {/if}

      <!-- Contact info -->
      <div class="border border-border rounded-xl p-5">
        <h3 class="text-base font-semibold mb-4">Coordonnées</h3>
        <div class="space-y-3 text-sm">
          {#if contact.email}
            <div class="flex items-center gap-3 text-muted-foreground">
              <svg class="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2.94 6.34A2 2 0 014.58 5h10.84a2 2 0 011.64.84L10 10.382 2.94 6.34z"/>
                <path d="M18 8.118l-7.553 4.42a1 1 0 01-.894 0L2 8.118V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
              </svg>
              <button
                onclick={() => { navigator.clipboard.writeText(contact.email!); toast.success("Email copié"); }}
                class="hover:text-foreground transition-colors hover:underline"
              >{contact.email}</button>
            </div>
          {/if}
          {#if contact.phone1}
            <div class="flex items-center gap-3 text-muted-foreground">
              <svg class="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/>
              </svg>
              <button
                onclick={() => { navigator.clipboard.writeText(contact.phone1!); toast.success("Téléphone copié"); }}
                class="hover:text-foreground transition-colors hover:underline"
              >{contact.phone1}</button>
            </div>
          {/if}
          {#if contact.phone2}
            <div class="flex items-center gap-3 text-muted-foreground">
              <svg class="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/>
              </svg>
              <span>{contact.phone2}</span>
            </div>
          {/if}
          {#if !contact.email && !contact.phone1 && !contact.phone2}
            <p class="text-muted-foreground italic text-xs">Aucune coordonnée renseignée</p>
          {/if}
        </div>
      </div>

      <!-- About / Summary -->
      {#if summary}
        <div class="border border-border rounded-xl p-5">
          <h3 class="text-base font-semibold mb-3">À propos</h3>
          <p class="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{summary}</p>
        </div>
      {/if}

      <!-- Experiences -->
      {#if experiences().length > 0}
        <div class="border border-border rounded-xl p-5">
          <h3 class="text-base font-semibold mb-4">Expériences</h3>
          <div class="space-y-5">
            {#each experiences() as exp}
              <div class="flex gap-3">
                <div class="flex-shrink-0 mt-1">
                  {#if exp.companyLogo}
                    <img src={exp.companyLogo} alt={exp.company} class="w-9 h-9 rounded border object-cover" />
                  {:else}
                    <div class="w-9 h-9 rounded bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">
                      {getInitial(exp.company)}
                    </div>
                  {/if}
                </div>
                <div class="flex-1 space-y-0.5">
                  <div class="font-semibold text-sm text-foreground">{exp.title || "Poste non spécifié"}</div>
                  <div class="text-sm text-muted-foreground">{exp.company || "Entreprise non spécifiée"}</div>
                  {#if exp.dateFrom || exp.dateTo}
                    <div class="text-xs text-muted-foreground">
                      {formatPeriod(exp.dateFrom, exp.dateTo, exp.isCurrent)}
                    </div>
                  {/if}
                  {#if exp.description}
                    <p class="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-3">{exp.description}</p>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Skills -->
      {#if skills().length > 0}
        <div class="border border-border rounded-xl p-5">
          <h3 class="text-base font-semibold mb-3">Compétences</h3>
          <div class="flex flex-wrap gap-2">
            {#each skills() as skill}
              <span class="px-3 py-1 bg-muted text-muted-foreground rounded-lg text-xs font-medium hover:bg-muted/80 transition-colors">
                {skill}
              </span>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Education -->
      {#if education().length > 0}
        <div class="border border-border rounded-xl p-5">
          <h3 class="text-base font-semibold mb-4">Formation</h3>
          <div class="space-y-4">
            {#each education() as edu}
              <div class="flex gap-3">
                <div class="flex-shrink-0 mt-1">
                  <div class="w-3 h-3 rounded-full bg-indigo-500 mt-1"></div>
                </div>
                <div class="flex-1 space-y-0.5">
                  {#if edu.degree}
                    <div class="font-semibold text-sm">{edu.degree}</div>
                  {/if}
                  {#if edu.school}
                    <div class="text-sm text-muted-foreground">{edu.school}</div>
                  {/if}
                  {#if edu.dateFrom || edu.dateTo}
                    <div class="text-xs text-muted-foreground">
                      {edu.dateFrom || "?"} — {edu.dateTo || "Présent"}
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

    <!-- ========== MESSAGE TAB ========== -->
    {:else if activeTab === "message"}
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-base font-semibold">Message de prospection IA</h3>
          <button
            onclick={() => onGenerateMessage?.(contact)}
            class="text-xs px-3 py-1.5 border border-input rounded hover:bg-accent transition-colors"
          >
            ✨ {contact.aiMessage ? "Regénérer" : "Générer"}
          </button>
        </div>

        {#if !contact.aiMessage && !editableMessage}
          <div class="text-center py-12 text-muted-foreground">
            <div class="text-4xl mb-3">✨</div>
            <p class="font-medium mb-1">Aucun message généré</p>
            <p class="text-sm mb-4">Cliquez sur "Générer" pour créer un message personnalisé</p>
          </div>
        {:else}
          <textarea
            bind:value={editableMessage}
            rows={10}
            class="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            placeholder="Le message apparaîtra ici après génération..."
          ></textarea>
          <div class="flex items-center justify-between">
            <p class="text-xs text-muted-foreground">{editableMessage.length} caractères</p>
            <button
              onclick={saveMessage}
              disabled={savingMessage}
              class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {savingMessage ? "Sauvegarde..." : "Sauvegarder"}
            </button>
          </div>
        {/if}
      </div>

    <!-- ========== NOTES TAB ========== -->
    {:else if activeTab === "notes"}
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-base font-semibold">Notes</h3>
        </div>

        <!-- Status & tracking fields -->
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dernière action</label>
            <p class="text-sm">{contact.lastAction || "—"}</p>
          </div>
          <div class="space-y-1">
            <label class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Prochaine étape</label>
            <p class="text-sm">{contact.nextStep || "—"}</p>
          </div>
        </div>

        <textarea
          bind:value={editableNotes}
          rows={10}
          class="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          placeholder="Vos notes sur ce contact..."
        ></textarea>
        <div class="flex justify-end">
          <button
            onclick={saveNotes}
            disabled={savingNotes}
            class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {savingNotes ? "Sauvegarde..." : "Sauvegarder"}
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>
