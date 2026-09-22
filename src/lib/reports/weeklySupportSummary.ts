import type { WeeklyJournalMetrics } from "./sources/journalMetrics.ts";
import { AI_MODELS } from "../ai/models.ts";
import { ThinkingLevel } from "@google/genai";

export const WEEKLY_REPORT_MODEL = AI_MODELS.WEEKLY_REFLECTION;

export const WEEKLY_REPORT_SYSTEM_INSTRUCTION = `Create a supportive weekly summary from the supplied structured sources.
Journal data contains behavioral counts and labels explicitly selected by the user only. Describe those as observations or user selections.
Never claim causation, diagnose, psychoanalyze, infer symptoms from writing time or length, or present a user-selected label as an AI-detected fact.
Do not imply access to private journal text. Return the required structured JSON only.`;

export interface WeeklyReportSources {
  moodTrackerData: unknown;
  momoSessionSummaries: unknown;
  therapistReviewedNotes: unknown;
  objectiveAppActivity: unknown;
  journalMetrics: WeeklyJournalMetrics;
}

const FORBIDDEN_JOURNAL_KEYS = new Set([
  "ciphertext", "plaintext", "body", "title", "excerpt", "summary", "embedding", "embeddings", "vector",
]);

export function assertJournalMetricsArePrivacySafe(value: unknown): void {
  const visit = (current: unknown): void => {
    if (Array.isArray(current)) return current.forEach(visit);
    if (!current || typeof current !== "object") return;
    for (const [key, child] of Object.entries(current)) {
      if (FORBIDDEN_JOURNAL_KEYS.has(key.toLowerCase())) {
        throw new Error(`Unsafe journal field in weekly report input: ${key}`);
      }
      visit(child);
    }
  };
  visit(value);
}

export function buildWeeklySupportSummaryRequest(sources: WeeklyReportSources) {
  assertJournalMetricsArePrivacySafe(sources.journalMetrics);
  return {
    model: WEEKLY_REPORT_MODEL,
    contents: [{ role: "user" as const, parts: [{ text: JSON.stringify(sources) }] }],
    config: {
      systemInstruction: WEEKLY_REPORT_SYSTEM_INSTRUCTION,
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          observations: { type: "array", items: { type: "string" } },
          supportiveReflection: { type: "string" },
          suggestedNextSteps: { type: "array", items: { type: "string" } },
        },
        required: ["observations", "supportiveReflection", "suggestedNextSteps"],
      },
    },
  };
}
