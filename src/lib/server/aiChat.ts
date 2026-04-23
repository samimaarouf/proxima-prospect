/**
 * Thin wrapper around Claude (Anthropic) with an OpenAI fallback.
 *
 * Rationale: Claude Sonnet 4.5 produces noticeably better French prospecting
 * copy than gpt-4o (more sober, less "AI-written" feel). We keep the OpenAI
 * path as a safety net for environments where `ANTHROPIC_API_KEY` is not set.
 *
 * Only used for message generation — web search tasks stay on OpenAI because
 * the `web_search_preview` tool is cheaper for the short hook queries.
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { env } from "$env/dynamic/private";

export type ChatParams = {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
};

/**
 * Preferred Claude model. Update this single line when Anthropic ships a new
 * GA Sonnet release.
 */
const CLAUDE_MODEL = "claude-sonnet-4-5";

/** OpenAI model used when no Anthropic key is configured. */
const OPENAI_FALLBACK_MODEL = "gpt-4o";

export async function chatComplete({
  systemPrompt,
  userPrompt,
  maxTokens = 500,
  temperature = 0.7,
}: ChatParams): Promise<string> {
  if (env.ANTHROPIC_API_KEY) {
    const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    // Anthropic responses can contain multiple content blocks (text, tool_use,
    // etc.). For a plain chat call we only care about the concatenated text.
    const text = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();
    return text;
  }

  if (!env.OPENAI_API_KEY) {
    throw new Error(
      "Aucune clé IA configurée : ajoutez ANTHROPIC_API_KEY (recommandé) ou OPENAI_API_KEY.",
    );
  }

  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const completion = await openai.chat.completions.create({
    model: OPENAI_FALLBACK_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: maxTokens,
    temperature,
  });
  return completion.choices[0]?.message?.content?.trim() || "";
}

/** Small utility used by the UI/back-end for logging/debug. */
export function activeChatProvider(): "anthropic" | "openai" | "none" {
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  if (env.OPENAI_API_KEY) return "openai";
  return "none";
}
