import "server-only";

function enabled(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export const FEATURE_FLAGS = Object.freeze({
  WEEKLY_REPORTS: enabled(process.env.ENABLE_WEEKLY_REPORTS, true),
  AI_THERAPY_NOTES: enabled(process.env.ENABLE_AI_THERAPY_NOTES, true),
  SAFETY_DASHBOARD: enabled(process.env.ENABLE_SAFETY_DASHBOARD, true),
  MOMO_VOICE: enabled(process.env.ENABLE_MOMO_VOICE, false),
});

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return FEATURE_FLAGS[flag];
}
