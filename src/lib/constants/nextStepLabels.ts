export interface NextStepLabelOption {
  /** Exact text stored in DB when this preset is chosen */
  value: string;
  /** Displayed label (same as value for presets) */
  label: string;
  emoji?: string;
  /** Background + text color classes (inline styles, not Tailwind, for portability in renderers) */
  bg: string;
  fg: string;
}

export const NEXT_STEP_LABELS: NextStepLabelOption[] = [
  {
    value: "Relancer",
    label: "Relancer",
    emoji: "🔄",
    bg: "#fed7aa",
    fg: "#9a3412",
  },
  {
    value: "Envoyer mail",
    label: "Envoyer mail",
    emoji: "📧",
    bg: "#2563eb",
    fg: "#ffffff",
  },
  {
    value: "Organiser RDV",
    label: "Organiser RDV",
    emoji: "🤝",
    bg: "#15803d",
    fg: "#ffffff",
  },
  {
    value: "LinkedIn",
    label: "LinkedIn",
    emoji: "💬",
    bg: "#7c3aed",
    fg: "#ffffff",
  },
  {
    value: "Rien",
    label: "Rien",
    emoji: "✋",
    bg: "#fde68a",
    fg: "#78350f",
  },
  {
    value: "Stop",
    label: "Stop",
    emoji: "🛑",
    bg: "#b91c1c",
    fg: "#ffffff",
  },
  {
    value: "Relancer bon persona",
    label: "Relancer bon persona",
    bg: "#78350f",
    fg: "#fef3c7",
  },
  {
    value: "Doit accepter invit",
    label: "Doit accepter invit",
    bg: "#92400e",
    fg: "#fef3c7",
  },
];

const DEFAULT_CUSTOM: Pick<NextStepLabelOption, "bg" | "fg"> = {
  bg: "#e5e7eb",
  fg: "#374151",
};

/**
 * Resolve styling for a given next-step label. Presets match exactly (case-insensitive);
 * custom free text gets a neutral gray pill.
 */
export function resolveNextStepLabel(
  value: string | null | undefined,
): NextStepLabelOption | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const preset = NEXT_STEP_LABELS.find(
    (o) => o.value.toLowerCase() === trimmed.toLowerCase(),
  );
  if (preset) return preset;
  return {
    value: trimmed,
    label: trimmed,
    ...DEFAULT_CUSTOM,
  };
}
