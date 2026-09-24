import { z } from "zod";

const reportStatement = z.string().trim().min(1).max(500);

export const weeklyReflectionSchema = z.object({
  observations: z.array(reportStatement).max(20),
  supportiveReflection: z.string().trim().max(4000),
  suggestedNextSteps: z.array(reportStatement).max(10),
}).strict();
export type WeeklyReflection = z.infer<typeof weeklyReflectionSchema>;

export const weeklyTherapySchema = z.object({
  sessions: z.array(z.string().trim().min(1).max(200)).max(20),
  topicsDiscussed: z.array(reportStatement).max(30),
  userReportedConcerns: z.array(reportStatement).max(30),
  strategiesDiscussed: z.array(reportStatement).max(30),
  goalsAgreed: z.array(reportStatement).max(30),
  followUpItems: z.array(reportStatement).max(30),
}).strict();
export type WeeklyTherapySummary = z.infer<typeof weeklyTherapySchema>;

export const weeklyReportSchema = z.object({
  therapy: weeklyTherapySchema.nullable(),
  reflection: weeklyReflectionSchema.nullable(),
}).strict();
export type WeeklyReport = z.infer<typeof weeklyReportSchema>;

export const weeklyReportPeriodSchema = z.object({
  weekStart: z.string().datetime(),
  weekEnd: z.string().datetime(),
}).strict().refine(
  ({ weekStart, weekEnd }) => Date.parse(weekEnd) - Date.parse(weekStart) === 7 * 86_400_000,
  "Weekly report periods must span exactly seven days"
);
