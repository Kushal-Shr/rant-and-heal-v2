import { ThinkingLevel, type ThinkingConfig } from "@google/genai";
import { AI_MODELS, THINKING_LEVELS } from "@/src/lib/ai/models";
import {
  planMomoResponseWithModel,
} from "@/src/lib/momo/planner";
import { MOMO_PLANNER_PROMPT } from "@/src/lib/momo/prompts/planner";
import {
  momoPlannerInferenceSchema,
  type MomoDecision,
  type NormalizedConversationInput,
} from "@/src/lib/momo/schemas";
import type { SafetyState } from "@/src/lib/safety/schemas";
import { getGeminiClient } from "./gemini";

const RECENT_PLANNER_TURNS = 12;

const plannerResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    supportMode: { type: "string", enum: ["LISTEN", "WORK_THROUGH", "DIRECT_HELP", "REGULATE", "UNCLEAR"] },
    primaryNeed: { type: "string", enum: ["VENT", "UNDERSTAND", "PRACTICAL_HELP", "COGNITIVE_SUPPORT", "EMOTIONAL_REGULATION", "PROFESSIONAL_SUPPORT", "UNKNOWN"] },
    intervention: { type: "string", enum: ["NONE", "PCT_LISTENING", "PCT_EXPLORATION", "CBT_RESTRUCTURING", "PROBLEM_SOLVING", "RELAXATION", "PROFESSIONAL_SUPPORT"] },
    confidence: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
    shouldClarify: { type: "boolean" },
    clarificationTarget: { type: ["string", "null"], enum: ["SUPPORT_PREFERENCE", "SITUATION", "EMOTION", "THOUGHT", "GOAL", "OTHER", null] },
  },
  required: ["supportMode", "primaryNeed", "intervention", "confidence", "shouldClarify", "clarificationTarget"],
} as const;

function plannerThinkingLevel(): ThinkingLevel {
  const configuredLevel: string = THINKING_LEVELS.MOMO_PLANNER;
  switch (configuredLevel) {
    case "high": return ThinkingLevel.HIGH;
    case "medium": return ThinkingLevel.MEDIUM;
    default: return ThinkingLevel.LOW;
  }
}

function plannerThinkingConfig(model: string): ThinkingConfig {
  // Gemini 2.5 accepts token budgets rather than thinkingLevel. Keep this
  // model-aware so a future Gemini 3 planner can continue using named levels.
  if (/gemini-2\.5/i.test(model)) {
    const configuredLevel: string = THINKING_LEVELS.MOMO_PLANNER;
    const thinkingBudget = configuredLevel === "high"
      ? 4_096
      : configuredLevel === "medium"
        ? 2_048
        : 512;
    return { thinkingBudget };
  }
  return { thinkingLevel: plannerThinkingLevel() };
}

async function inferMomoRouting(input: NormalizedConversationInput): Promise<unknown> {
  const recentConversation = input.history.slice(-RECENT_PLANNER_TURNS);
  const model = process.env.GEMINI_PLANNER_MODEL ?? AI_MODELS.MOMO_PLANNER;
  const generation = getGeminiClient().models.generateContent({
    model,
    contents: [{
      role: "user",
      parts: [{ text: JSON.stringify({ recentConversation, currentUserMessage: input.messageText }) }],
    }],
    config: {
      systemInstruction: MOMO_PLANNER_PROMPT,
      thinkingConfig: plannerThinkingConfig(model),
      responseMimeType: "application/json",
      responseJsonSchema: plannerResponseJsonSchema,
    },
  });
  const result = await Promise.race([
    generation,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Momo planner timed out")), 6_000)
    ),
  ]);
  return momoPlannerInferenceSchema.parse(JSON.parse(result.text ?? ""));
}

export async function planMomoResponseWithInference(
  input: NormalizedConversationInput,
  safetyState: SafetyState
): Promise<MomoDecision> {
  return planMomoResponseWithModel(
    input,
    safetyState,
    inferMomoRouting,
    (error) => console.warn("MOMO BEHAVIORAL PLANNER UNAVAILABLE:", error)
  );
}
