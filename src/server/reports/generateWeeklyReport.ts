import {
  weeklyReflectionSchema,
  weeklyTherapySchema,
  type WeeklyReflection,
  type WeeklyTherapySummary,
} from "@/src/lib/reports/schemas";
import { buildWeeklyTherapyRequest } from "@/src/lib/reports/therapyWeekly";
import {
  buildWeeklySupportSummaryRequest,
  type WeeklyReportSources,
} from "@/src/lib/reports/weeklySupportSummary";
import type { NoteContent } from "@/src/lib/therapy/notes";
import { getGeminiClient } from "@/src/server/momo/gemini";

interface ReviewedNoteSource {
  source: string;
  content: NoteContent;
}

export async function generateWeeklyReport(
  sources: WeeklyReportSources,
  reviewedNotes: ReviewedNoteSource[]
): Promise<{ therapy: WeeklyTherapySummary; reflection: WeeklyReflection }> {
  const client = getGeminiClient();
  const [therapyResult, reflectionResult] = await Promise.all([
    client.models.generateContent(buildWeeklyTherapyRequest(reviewedNotes)),
    client.models.generateContent(buildWeeklySupportSummaryRequest(sources)),
  ]);
  const generatedTherapy = weeklyTherapySchema.parse(JSON.parse(therapyResult.text ?? "null"));
  const sessionLabels = {
    TEXT_CHAT: "text session",
    VIDEO_CALL: "video session",
    VOICE_CALL: "voice session",
  } as const;
  const sessions = Object.entries(sessionLabels).flatMap(([source, label]) => {
    const count = reviewedNotes.filter((note) => note.source === source).length;
    return count ? [`${count} ${label}${count === 1 ? "" : "s"}`] : [];
  });
  return {
    therapy: { ...generatedTherapy, sessions },
    reflection: weeklyReflectionSchema.parse(JSON.parse(reflectionResult.text ?? "null")),
  };
}
