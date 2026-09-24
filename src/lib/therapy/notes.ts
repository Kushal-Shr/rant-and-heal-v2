import { z } from "zod";

export const THERAPY_SESSION_NOTE_STATUSES = ["AI_DRAFT", "THERAPIST_REVIEWED"] as const;
export const therapySessionNoteStatusSchema = z.enum(THERAPY_SESSION_NOTE_STATUSES);
export type TherapySessionNoteStatus = z.infer<typeof therapySessionNoteStatusSchema>;

const boundedText = z.string().trim().max(4000);
const statements = z.array(z.string().trim().min(1).max(500)).max(30);
export const noteContentSchema = z.object({
  summary: boundedText,
  userReportedConcerns: statements,
  topicsDiscussed: statements,
  strategiesDiscussed: statements,
  goalsAgreed: statements,
  followUpItems: statements,
  evidence: z.array(z.object({
    kind: z.enum(["USER_REPORTED", "THERAPIST_STATED", "AGREED_GOAL", "FOLLOW_UP"]),
    statement: z.string().trim().min(1).max(500),
  }).strict()).max(40),
}).strict();
export type NoteContent = z.infer<typeof noteContentSchema>;

export const noteSourceSchema = z.enum(["TEXT_CHAT", "VIDEO_CALL", "VOICE_CALL"]);
export type TherapySessionNoteSource = z.infer<typeof noteSourceSchema>;
export const callInputSchema = z.object({
  focus: z.string().trim().min(1).max(4000),
  userConcerns: z.string().trim().max(4000),
  strategies: z.string().trim().max(4000),
  goals: z.string().trim().max(4000),
  followUp: z.string().trim().max(4000),
}).strict();

export const THERAPY_NOTE_PROMPT_VERSION = "therapy-note-v1";
export const THERAPY_NOTE_INSTRUCTION = `Organize only the supplied therapy source into a draft shared session note. Return the required JSON.
Do not diagnose, invent symptoms or facts, guess therapist intent, infer unsupported causes, assign risk scores, or turn "the user reported" into "the patient has".
Attribute claims as USER_REPORTED, THERAPIST_STATED, AGREED_GOAL, or FOLLOW_UP. Omit unsupported fields. Do not present a suggestion as a clinical requirement. This is a draft for therapist review.`;

export const noteJsonSchema = {
  type: "object", additionalProperties: false,
  properties: {
    summary: { type: "string" },
    userReportedConcerns: { type: "array", items: { type: "string" } },
    topicsDiscussed: { type: "array", items: { type: "string" } },
    strategiesDiscussed: { type: "array", items: { type: "string" } },
    goalsAgreed: { type: "array", items: { type: "string" } },
    followUpItems: { type: "array", items: { type: "string" } },
    evidence: { type: "array", items: {
      type: "object", additionalProperties: false,
      properties: { kind: { type: "string", enum: ["USER_REPORTED", "THERAPIST_STATED", "AGREED_GOAL", "FOLLOW_UP"] }, statement: { type: "string" } },
      required: ["kind", "statement"],
    } },
  },
  required: ["summary", "userReportedConcerns", "topicsDiscussed", "strategiesDiscussed", "goalsAgreed", "followUpItems", "evidence"],
} as const;
