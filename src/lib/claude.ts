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
  model?: string;
}

export interface GenerateResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

async function callClaude(prompt: string, systemPrompt?: string, options?: GenerateOptions): Promise<GenerateResult> {
  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model: options?.model ?? config.claudeModel,
    max_tokens: options?.maxTokens ?? 2048,
    system: systemPrompt || "",
    messages: [{ role: "user", content: prompt }],
    ...(options?.temperature !== undefined && { temperature: options.temperature }),
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return {
    text: textBlock?.text || "",
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

export async function generateText(prompt: string, systemPrompt?: string, options?: GenerateOptions): Promise<string> {
  const result = await callClaude(prompt, systemPrompt, options);
  return result.text;
}

export async function generateTextWithUsage(prompt: string, systemPrompt?: string, options?: GenerateOptions): Promise<GenerateResult> {
  return callClaude(prompt, systemPrompt, options);
}
