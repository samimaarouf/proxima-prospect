export type ContactStatusValue =
  | "undefined"
  | "no_answer"
  | "interested"
  | "closed";

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
    color: "bg-blue-50 text-blue-700",
  },
  {
    value: "no_answer",
    label: "Ne répond pas",
    emoji: "⏸️",
    color: "bg-slate-100 text-slate-700",
  },
  {
    value: "interested",
    label: "Intéressé",
    emoji: "✅",
    color: "bg-green-100 text-green-700",
  },
  {
    value: "closed",
    label: "Clôturé",
    emoji: "🔒",
    color: "bg-gray-200 text-gray-700",
  },
];

export const DEFAULT_STATUS: ContactStatusValue = "undefined";

export function resolveStatus(value: string | null | undefined): ContactStatusOption {
  return (
    STATUS_OPTIONS.find((s) => s.value === value) ||
    STATUS_OPTIONS.find((s) => s.value === DEFAULT_STATUS)!
  );
}
