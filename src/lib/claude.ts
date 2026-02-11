import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  if (!config.anthropicApiKey) throw new Error("ANTHROPIC_API_KEY not set");
  client = new Anthropic({ apiKey: config.anthropicApiKey });
  return client;
}

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
}

export async function generateText(prompt: string, systemPrompt?: string, options?: GenerateOptions): Promise<string> {
  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model: config.claudeModel,
    max_tokens: options?.maxTokens ?? 2048,
    system: systemPrompt || "",
    messages: [{ role: "user", content: prompt }],
    ...(options?.temperature !== undefined && { temperature: options.temperature }),
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock?.text || "";
}
