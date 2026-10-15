import type { ConversationContinuityState, InterventionOutcomeRecord } from "./schemas.ts";
import type { MomoPrivacyPreferences } from "./privacy.ts";

export interface MomoMoodAnalyticsCandidate {
  moodScore?: number;
  stressScore?: number;
  energyScore?: number;
  sleepQuality?: number;
}

const SCORE_PATTERNS: Record<keyof MomoMoodAnalyticsCandidate, RegExp[]> = {
  moodScore: [/(?:my\s+)?mood(?:\s+is|\s*[:=])?\s*(10|[1-9])\s*(?:\/|out of)\s*10\b/i],
  stressScore: [/(?:my\s+)?stress(?:\s+is|\s*[:=])?\s*(10|[1-9])\s*(?:\/|out of)\s*10\b/i],
  energyScore: [/(?:my\s+)?energy(?:\s+is|\s*[:=])?\s*(10|[1-9])\s*(?:\/|out of)\s*10\b/i],
  sleepQuality: [/(?:my\s+)?sleep(?:\s+quality)?(?:\s+is|\s*[:=])?\s*(10|[1-9])\s*(?:\/|out of)\s*10\b/i],
};

export function extractStructuredMoodScores(text: string): MomoMoodAnalyticsCandidate | null {
  const result: MomoMoodAnalyticsCandidate = {};
  for (const [field, patterns] of Object.entries(SCORE_PATTERNS) as [keyof MomoMoodAnalyticsCandidate, RegExp[]][]) {
    const match = patterns.map((pattern) => text.match(pattern)).find(Boolean);
    if (match) result[field] = Number(match[1]);
  }
  return Object.keys(result).length ? result : null;
}

export function newlyRecordedOutcome(
  previous: ConversationContinuityState | undefined,
  next: ConversationContinuityState
): InterventionOutcomeRecord | null {
  const latest = next.recentInterventions.at(-1);
  if (!latest) return null;
  const previousLatest = previous?.recentInterventions.at(-1);
  return previousLatest?.recordedAt === latest.recordedAt ? null : latest;
}

export function buildPermittedMomoAnalytics(options: {
  messageText: string;
  previousContinuity?: ConversationContinuityState;
  nextContinuity: ConversationContinuityState;
  preferences: MomoPrivacyPreferences;
}): {
  mood: MomoMoodAnalyticsCandidate | null;
  outcome: InterventionOutcomeRecord | null;
} {
  const { messageText, previousContinuity, nextContinuity, preferences } = options;
  return {
    mood: preferences.moodTrendAnalyticsEnabled
      ? extractStructuredMoodScores(messageText)
      : null,
    outcome: preferences.outcomeAnalyticsEnabled
      ? newlyRecordedOutcome(previousContinuity, nextContinuity)
      : null,
  };
}
