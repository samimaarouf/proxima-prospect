/**
 * Wrapper Claude (Anthropic) — seul provider IA de l'application.
 */
import Anthropic from "@anthropic-ai/sdk";
import { env } from "$env/dynamic/private";

export type ChatParams = {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  /** Modèle Claude à utiliser. Par défaut Sonnet (rédaction). */
  model?: string;
};

/** Rédaction cold email, messages LinkedIn, tâches qualité. */
export const CLAUDE_MODEL = "claude-sonnet-4-5";

/** Extraction JSON, résumés, classification — plus rapide et économique. */
export const CLAUDE_FAST_MODEL = "claude-haiku-4-5";

function getClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY requise. Configurez-la dans les variables d'environnement.",
    );
  }
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

export function hasAnthropicKey(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}

export async function chatComplete({
  systemPrompt,
  userPrompt,
  maxTokens = 500,
  temperature = 0.7,
  model = CLAUDE_MODEL,
}: ChatParams): Promise<string> {
  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  return extractTextFromMessage(response.content);
}

function extractTextFromMessage(
  content: Anthropic.Messages.ContentBlock[],
): string {
  return content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();
}

export type WebSearchParams = ChatParams & {
  /** Nombre max de recherches web par requête (défaut 2). */
  maxSearchUses?: number;
};

/**
 * Appel Claude avec l'outil web_search intégré (actualité entreprise, etc.).
 */
export async function chatWithWebSearch({
  systemPrompt,
  userPrompt,
  maxTokens = 400,
  temperature = 0.2,
  model = CLAUDE_FAST_MODEL,
  maxSearchUses = 2,
}: WebSearchParams): Promise<string> {
  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: maxSearchUses,
      },
    ],
  });

  return extractTextFromMessage(response.content);
}

export async function chatWithWebSearchJson<T>(params: WebSearchParams): Promise<T> {
  const raw = await chatWithWebSearch({
    ...params,
    systemPrompt:
      params.systemPrompt +
      "\n\nRéponds UNIQUEMENT avec du JSON valide, sans markdown ni commentaire.",
  });
  return JSON.parse(extractJsonBlock(raw)) as T;
}

/** Extrait un bloc JSON d'une réponse (avec ou sans fences markdown). */
export function extractJsonBlock(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1]!.trim();

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

export async function chatCompleteJson<T>(
  params: ChatParams,
): Promise<T> {
  const raw = await chatComplete({
    ...params,
    model: params.model ?? CLAUDE_FAST_MODEL,
    systemPrompt:
      params.systemPrompt +
      "\n\nRéponds UNIQUEMENT avec du JSON valide, sans markdown ni commentaire.",
  });
  return JSON.parse(extractJsonBlock(raw)) as T;
}

export function activeChatProvider(): "anthropic" | "none" {
  return env.ANTHROPIC_API_KEY ? "anthropic" : "none";
}
