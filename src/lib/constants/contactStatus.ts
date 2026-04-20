export type ContactStatusValue =
  | "undefined"
  | "appele"
  | "rdv_pris"
  | "non_interesse"
  | "mauvais_numero"
  | "a_rappeler"
  | "mauvais_icp"
  | "pas_de_num"
  | "pas_le_bon_decideur"
  | "interesse"
  | "stop";

export interface ContactStatusOption {
  value: ContactStatusValue;
  label: string;
  emoji: string;
  /** Tailwind badge classes for the pill rendering */
  color: string;
}

export const STATUS_OPTIONS: ContactStatusOption[] = [
  {
    value: "undefined",
    label: "Non défini",
    emoji: "",
    color: "bg-gray-100 text-gray-700",
  },
  {
    value: "appele",
    label: "Appelé",
    emoji: "📞",
    color: "bg-amber-50 text-amber-900",
  },
  {
    value: "rdv_pris",
    label: "RDV pris",
    emoji: "✅",
    color: "bg-green-700 text-white",
  },
  {
    value: "non_interesse",
    label: "Non intéressé",
    emoji: "🚫",
    color: "bg-red-100 text-red-700",
  },
  {
    value: "mauvais_numero",
    label: "Mauvais numéro",
    emoji: "❌",
    color: "bg-red-600 text-white",
  },
  {
    value: "a_rappeler",
    label: "À rappeler",
    emoji: "🕐",
    color: "bg-sky-100 text-sky-800",
  },
  {
    value: "mauvais_icp",
    label: "Mauvais ICP",
    emoji: "",
    color: "bg-slate-700 text-white",
  },
  {
    value: "pas_de_num",
    label: "Pas de num",
    emoji: "",
    color: "bg-red-900 text-red-50",
  },
  {
    value: "pas_le_bon_decideur",
    label: "Pas le bon décideur",
    emoji: "",
    color: "bg-purple-100 text-purple-800",
  },
  {
    value: "interesse",
    label: "Intéressé",
    emoji: "",
    color: "bg-green-100 text-green-800",
  },
  {
    value: "stop",
    label: "Stop",
    emoji: "",
    color: "bg-amber-800 text-amber-50",
  },
];

export const DEFAULT_STATUS: ContactStatusValue = "undefined";

/**
 * Statuses that mark a contact as "done" — no more outreach needed.
 * These contacts don't get the red "needs action" highlight.
 */
export const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  "rdv_pris",
  "non_interesse",
  "mauvais_numero",
  "mauvais_icp",
  "pas_de_num",
  "pas_le_bon_decideur",
  "stop",
  // Legacy value (kept for rows migrated from previous schema)
  "closed",
]);

export function isTerminalStatus(value: string | null | undefined): boolean {
  if (!value) return false;
  return TERMINAL_STATUSES.has(value.trim().toLowerCase());
}

/**
 * Map legacy DB values (from earlier schema iterations) to current presets.
 * Any unknown value falls back to the default.
 */
const LEGACY_MAP: Record<string, ContactStatusValue> = {
  no_answer: "a_rappeler",
  waiting: "undefined",
  not_interested: "non_interesse",
  interested: "interesse",
  closed: "stop",
};

export function resolveStatus(
  value: string | null | undefined,
): ContactStatusOption {
  const fallback = STATUS_OPTIONS.find((s) => s.value === DEFAULT_STATUS)!;
  if (!value) return fallback;
  const trimmed = value.trim();
  const direct = STATUS_OPTIONS.find((s) => s.value === trimmed);
  if (direct) return direct;
  const legacy = LEGACY_MAP[trimmed];
  if (legacy) {
    return STATUS_OPTIONS.find((s) => s.value === legacy) || fallback;
  }
  return fallback;
}
