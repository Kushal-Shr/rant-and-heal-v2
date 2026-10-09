import type { Content } from "@google/genai";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import {
  AI_MODEL_CONFIGS,
  THINKING_LEVELS,
  type AIProvider,
  type ModelConfig,
} from "@/src/lib/ai/models";
import type { ConversationTurn } from "@/src/lib/momo/schemas";
import { GEMINI_MOMO_TEXT_MODEL, getGeminiClient } from "./gemini";
import { getOpenAIClient } from "./openai";
import { thinkingConfigFor } from "./thinkingConfig";

export interface MomoTextRequest {
  instructions: string;
  history: ConversationTurn[];
  messageText: string;
}

export type MomoTextGenerator = (request: MomoTextRequest, model: string) => Promise<string>;
export type MomoTextGenerators = Record<AIProvider, MomoTextGenerator>;

export function resolveMomoTextConfig(
  environment: NodeJS.ProcessEnv = process.env
): ModelConfig {
  const provider = environment.MOMO_TEXT_PROVIDER ?? AI_MODEL_CONFIGS.MOMO_RESPONSE.provider;
  if (provider !== "openai" && provider !== "gemini") {
    throw new Error("MOMO_TEXT_PROVIDER must be either openai or gemini.");
  }
  return {
    provider,
    model: provider === "openai"
      ? AI_MODEL_CONFIGS.MOMO_RESPONSE.model
      : environment.GEMINI_MODEL ?? GEMINI_MOMO_TEXT_MODEL,
  };
}

export function buildOpenAIResponseRequest(
  request: MomoTextRequest,
  model: string = AI_MODEL_CONFIGS.MOMO_RESPONSE.model
): ResponseCreateParamsNonStreaming {
  return {
    model,
    instructions: request.instructions,
    input: [
      ...request.history.map((turn) => ({
        role: turn.role === "MOMO" ? "assistant" as const : "user" as const,
        content: turn.text,
      })),
      { role: "user", content: request.messageText },
    ],
    reasoning: { effort: THINKING_LEVELS.MOMO_RESPONSE },
    store: false,
  };
}

export function buildGeminiResponseRequest(
  request: MomoTextRequest,
  model = GEMINI_MOMO_TEXT_MODEL
): { model: string; contents: Content[]; config: { thinkingConfig: ReturnType<typeof thinkingConfigFor>; systemInstruction: string } } {
  return {
    model,
    contents: [
      ...request.history.map((turn) => ({
        role: turn.role === "MOMO" ? "model" : "user",
        parts: [{ text: turn.text }],
      })),
      { role: "user", parts: [{ text: request.messageText }] },
    ],
    config: {
      thinkingConfig: thinkingConfigFor(THINKING_LEVELS.MOMO_RESPONSE, model),
      systemInstruction: request.instructions,
    },
  };
}

async function generateWithOpenAI(request: MomoTextRequest, model: string): Promise<string> {
  const response = await getOpenAIClient().responses.create(
    buildOpenAIResponseRequest(request, model)
  );
  return response.output_text?.trim() ?? "";
}

async function generateWithGemini(request: MomoTextRequest, model: string): Promise<string> {
  const response = await getGeminiClient().models.generateContent(
    buildGeminiResponseRequest(request, model)
  );
  return response.text?.trim() ?? "";
}

export async function generateMomoText(request: MomoTextRequest): Promise<string> {
  const config = resolveMomoTextConfig();
  return generateMomoTextWithProvider(request, config, {
    openai: generateWithOpenAI,
    gemini: generateWithGemini,
  });
}

export async function generateMomoTextWithProvider(
  request: MomoTextRequest,
  config: ModelConfig,
  generators: MomoTextGenerators
): Promise<string> {
  const output = await generators[config.provider](request, config.model);
  if (!output) throw new Error(`${config.provider} returned an empty Momo response.`);
  return output;
}
