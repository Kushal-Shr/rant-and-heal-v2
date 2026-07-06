import { GoogleGenAI } from "@google/genai";

export const MOMO_TEXT_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
export const MOMO_LIVE_MODEL = process.env.GEMINI_LIVE_MODEL ?? "gemini-3.1-flash-live-preview";

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
