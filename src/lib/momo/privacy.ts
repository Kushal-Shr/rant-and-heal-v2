import { z } from "zod";

export const momoPrivacyPreferencesSchema = z.object({
  moodTrendAnalyticsEnabled: z.boolean(),
  outcomeAnalyticsEnabled: z.boolean(),
}).strict();

export type MomoPrivacyPreferences = z.infer<typeof momoPrivacyPreferencesSchema>;

export const DEFAULT_MOMO_PRIVACY_PREFERENCES: MomoPrivacyPreferences = Object.freeze({
  moodTrendAnalyticsEnabled: false,
  outcomeAnalyticsEnabled: false,
});

export function parseMomoPrivacyPreferences(value: unknown): MomoPrivacyPreferences {
  const parsed = momoPrivacyPreferencesSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_MOMO_PRIVACY_PREFERENCES;
}
