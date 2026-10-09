export type AIProvider = "gemini" | "openai";

export interface ModelConfig {
  provider: AIProvider;
  model: string;
}

export const EXPECTED_MOMO_RESPONSE_MODEL = "gpt-5.6-luna";
export const EXPECTED_MOMO_VOICE_MODEL = "gpt-live-1";

export const AI_MODEL_CONFIGS = {
  MOMO_RESPONSE: {
    provider: "openai",
    model: EXPECTED_MOMO_RESPONSE_MODEL,
  },
  MOMO_VOICE: {
    provider: "openai",
    model: EXPECTED_MOMO_VOICE_MODEL,
  },
} as const satisfies Record<"MOMO_RESPONSE" | "MOMO_VOICE", ModelConfig>;

export const AI_MODELS = {
  MOMO_PLANNER: "gemini-3.8-flash",
  MOMO_RESPONSE: AI_MODEL_CONFIGS.MOMO_RESPONSE.model,
  SAFETY_CLASSIFIER: "gemini-3.8-flash",
  SAFETY_SUPERVISOR: "gemini-3.8-flash",
  MOOD_EXTRACTION: "gemini-3.8-flash",
  SESSION_SUMMARY: "gemini-3.8-flash",
  THERAPY_NOTE: "gemini-3.8-flash",
  WEEKLY_REFLECTION: "gemini-3.8-flash",
  WEEKLY_THERAPY_SUMMARY: "gemini-3.8-flash",
  BACKGROUND_LIGHT: "gemini-3.5-flash-lite",
  VOICE: AI_MODEL_CONFIGS.MOMO_VOICE.model,
  TRANSCRIPTION: "gemini-3.5-transcribe",
  EMBEDDING: "gemini-embedding-2",
} as const;

export const THINKING_LEVELS = {
  MOMO_PLANNER: "low",
  MOMO_RESPONSE: "medium",
  SAFETY_CLASSIFIER: "medium",
  SAFETY_SUPERVISOR: "high",
  MOOD_EXTRACTION: "low",
  SESSION_SUMMARY: "low",
  THERAPY_NOTE: "medium",
  WEEKLY_REFLECTION: "high",
  WEEKLY_THERAPY_SUMMARY: "high",
} as const;
