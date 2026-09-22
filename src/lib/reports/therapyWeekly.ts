import { z } from "zod";
import { AI_MODELS } from "../ai/models.ts";
import { ThinkingLevel } from "@google/genai";
import type { NoteContent } from "../therapy/notes.ts";

export const weeklyReflectionSchema = z.object({
  observations: z.array(z.string().max(500)).max(20),
  supportiveReflection: z.string().max(4000),
  suggestedNextSteps: z.array(z.string().max(500)).max(10),
}).strict();
export const weeklyTherapySchema = z.object({
  sessions: z.array(z.string().max(200)).max(20),
  topicsDiscussed: z.array(z.string().max(500)).max(30),
  userReportedConcerns: z.array(z.string().max(500)).max(30),
  strategiesDiscussed: z.array(z.string().max(500)).max(30),
  goalsAgreed: z.array(z.string().max(500)).max(30),
  followUpItems: z.array(z.string().max(500)).max(30),
}).strict();

export function isReviewedTherapyNote(value: { status?: unknown; source?: unknown }): boolean {
  return value.status === "THERAPIST_REVIEWED" &&
    (value.source === "TEXT_CHAT" || value.source === "VIDEO_CALL" || value.source === "VOICE_CALL");
}

export function buildWeeklyTherapyRequest(notes: { source: string; content: NoteContent }[]) {
  return { model: AI_MODELS.WEEKLY_THERAPY_SUMMARY,
    contents: [{ role: "user" as const, parts: [{ text: JSON.stringify(notes) }] }],
    config: { systemInstruction: `Summarize only these therapist-reviewed shared notes. Do not diagnose, infer clinical facts or risk, or invent details. Keep user reports attributed to the user. Return JSON only.`,
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }, responseMimeType: "application/json",
      responseJsonSchema: { type: "object", additionalProperties: false,
        properties: Object.fromEntries(["sessions", "topicsDiscussed", "userReportedConcerns", "strategiesDiscussed", "goalsAgreed", "followUpItems"].map((key) => [key, { type: "array", items: { type: "string" } }])),
        required: ["sessions", "topicsDiscussed", "userReportedConcerns", "strategiesDiscussed", "goalsAgreed", "followUpItems"] },
    },
  };
}
