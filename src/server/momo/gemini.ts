import { ApiError, GoogleGenAI } from "@google/genai";
import { AI_MODELS } from "@/src/lib/ai/models";

export const MOMO_TEXT_MODEL = process.env.GEMINI_MODEL ?? AI_MODELS.MOMO_RESPONSE;
export const MOMO_LIVE_MODEL = process.env.GEMINI_LIVE_MODEL ?? AI_MODELS.VOICE;
export const SAFETY_CLASSIFIER_MODEL = process.env.GEMINI_SAFETY_MODEL ?? AI_MODELS.SAFETY_CLASSIFIER;

export function isGeminiBillingError(error: unknown): boolean {
  return (error instanceof ApiError && error.status === 402) ||
    (error instanceof Error && /prepayment credits are depleted/i.test(error.message));
}

export function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getGeminiClient() {
  return new GoogleGenAI({
    apiKey: getRequiredEnv("GEMINI_API_KEY"),
  });
}
