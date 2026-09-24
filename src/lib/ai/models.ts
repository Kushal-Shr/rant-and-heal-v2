export const AI_MODELS = {
  MOMO_PLANNER: "gemini-2.5-flash",
  MOMO_RESPONSE: "gemini-2.5-flash",
  SAFETY_CLASSIFIER: "gemini-2.5-flash",
  SAFETY_SUPERVISOR: "gemini-2.5-flash",
  MOOD_EXTRACTION: "gemini-2.5-flash",
  SESSION_SUMMARY: "gemini-2.5-flash",
  THERAPY_NOTE: "gemini-3.8-flash",
  WEEKLY_REFLECTION: "gemini-3.8-flash",
  WEEKLY_THERAPY_SUMMARY: "gemini-3.8-flash",
  BACKGROUND_LIGHT: "gemini-2.5-flash-lite",
  VOICE: "gemini-3.1-flash-live-preview",
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
