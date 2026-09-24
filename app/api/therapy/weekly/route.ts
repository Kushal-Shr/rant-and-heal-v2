import { NextResponse, type NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { verifyFirebaseBearerToken } from "@/src/server/auth";
import { requireRelationship, requireAiConsent, relationshipDek, TherapyAccessError } from "@/src/server/therapy/access";
import { readNote } from "@/src/server/therapy/notes";
import { encryptText, decryptText, type EncryptedPayload } from "@/src/server/therapy/crypto";
import { isGeminiBillingError } from "@/src/server/momo/gemini";
import { aggregateWeeklyJournalMetrics } from "@/src/lib/reports/sources/journalMetrics";
import { isReviewedTherapyNote } from "@/src/lib/reports/therapyWeekly";
import { weeklyReflectionSchema, weeklyTherapySchema } from "@/src/lib/reports/schemas";
import { generateWeeklyReport } from "@/src/server/reports/generateWeeklyReport";
import { FEATURE_FLAGS } from "@/src/config/features";

export const runtime = "nodejs";
const bodySchema = z.object({ relationshipId: z.string().min(1).max(128), weekStart: z.string().datetime() }).strict();
const WEEK = 7 * 86400000;

async function context(token: NonNullable<Awaited<ReturnType<typeof verifyFirebaseBearerToken>>>, relationshipId: string, weekStart: string) {
  const rel = await requireRelationship(token, relationshipId);
  const start = new Date(weekStart);
  if (!Number.isFinite(start.getTime()) || start.getUTCDay() !== 1 || start.getUTCHours() !== 0 || start.getUTCMinutes() !== 0 || start.getUTCSeconds() !== 0 || start.getUTCMilliseconds() !== 0 || start.getTime() > Date.now() || start.getTime() < Date.now() - 366 * 86400000) throw new Error("Invalid week start");
  return { rel, start, end: new Date(start.getTime() + WEEK), weekId: start.toISOString().slice(0, 10) };
}

async function reviewedNotes(rel: Awaited<ReturnType<typeof requireRelationship>>, relationshipId: string, start: Date, end: Date) {
  const snapshot = await rel.ref.collection("session_notes")
    .where("periodEnd", ">=", Timestamp.fromDate(start)).where("periodEnd", "<", Timestamp.fromDate(end)).get();
  const reviewed = snapshot.docs.filter((doc) => isReviewedTherapyNote(doc.data()));
  return Promise.all(reviewed.map(async (doc) => {
    const note = await readNote(doc.ref, relationshipId, "patient");
    return note ? { source: note.source as string, content: note.content } : null;
  })).then((items) => items.filter((item): item is NonNullable<typeof item> => item !== null));
}

function fail(error: unknown) {
  if (error instanceof TherapyAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (isGeminiBillingError(error)) return NextResponse.json({ error: "Weekly report AI is temporarily unavailable.", code: "AI_BILLING_REQUIRED" }, { status: 503 });
  if (error instanceof Error && error.message === "Invalid week start") return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ error: "Weekly report unavailable" }, { status: 500 });
}

export async function POST(request: NextRequest) {
  if (!FEATURE_FLAGS.WEEKLY_REPORTS) return NextResponse.json({ error: "Weekly reports are disabled.", code: "FEATURE_DISABLED" }, { status: 503 });
  const token = await verifyFirebaseBearerToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid weekly request" }, { status: 400 });
  try {
    const { relationshipId, weekStart } = parsed.data;
    const { rel, start, end, weekId } = await context(token, relationshipId, weekStart);
    if (token.uid !== rel.patientUid) throw new TherapyAccessError("Only the patient can generate weekly reports", 403);
    await requireAiConsent(relationshipId);
    const notes = await reviewedNotes(rel, relationshipId, start, end);
    const [moodSnap, momoSnap, journalMetrics] = await Promise.all([
      rel.ref.firestore.collection("users").doc(rel.patientUid).collection("health_metrics")
        .where("createdAt", ">=", Timestamp.fromDate(start)).where("createdAt", "<", Timestamp.fromDate(end)).get(),
      rel.ref.firestore.collection("users").doc(rel.patientUid).collection("sessions")
        .where("createdAt", ">=", Timestamp.fromDate(start)).where("createdAt", "<", Timestamp.fromDate(end)).get(),
      aggregateWeeklyJournalMetrics(rel.ref.firestore, rel.patientUid, start, end),
    ]);
    const sources = {
      moodTrackerData: moodSnap.docs.map((doc) => ({ moodScore: doc.data().moodScore, anxietyScore: doc.data().anxietyScore, energyScore: doc.data().energyScore })),
      momoSessionSummaries: momoSnap.docs.flatMap((doc) => typeof doc.data().summary === "string" ? [doc.data().summary] : []),
      therapistReviewedNotes: notes,
      objectiveAppActivity: { momoSessionCount: momoSnap.size, reviewedTherapySessionCount: notes.length },
      journalMetrics,
    };
    const { therapy, reflection } = await generateWeeklyReport(sources, notes);
    const dek = await relationshipDek(relationshipId);
    try {
      const therapyEncrypted = encryptText(dek, JSON.stringify(therapy), `${relationshipId}:weekly:therapy:${weekId}`);
      const reflectionEncrypted = encryptText(dek, JSON.stringify(reflection), `${relationshipId}:weekly:reflection:${weekId}`);
      await rel.ref.firestore.runTransaction(async (tx) => {
        const [relSnap, pointerSnap] = await Promise.all([tx.get(rel.ref), tx.get(rel.ref.firestore.collection("connections").doc(rel.patientUid))]);
        if (relSnap.data()?.status !== "ACTIVE" || pointerSnap.data()?.relationshipId !== relationshipId || pointerSnap.data()?.status !== "ACTIVE") throw new TherapyAccessError("Relationship unavailable", 403);
        tx.set(rel.ref.collection("weekly_therapy_summaries").doc(weekId), {
          relationshipId, weekStart: Timestamp.fromDate(start), weekEnd: Timestamp.fromDate(end),
          reviewedNoteCount: notes.length, ...therapyEncrypted, generatedAt: Timestamp.now(),
        });
        tx.set(rel.ref.collection("weekly_reflections").doc(weekId), {
          relationshipId, patientUid: rel.patientUid, weekStart: Timestamp.fromDate(start), weekEnd: Timestamp.fromDate(end),
          ...reflectionEncrypted, generatedAt: Timestamp.now(),
        });
      });
    } finally { dek.fill(0); }
    return NextResponse.json({ therapy, reflection }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return fail(error); }
}

export async function GET(request: NextRequest) {
  if (!FEATURE_FLAGS.WEEKLY_REPORTS) return NextResponse.json({ error: "Weekly reports are disabled.", code: "FEATURE_DISABLED" }, { status: 503 });
  const token = await verifyFirebaseBearerToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const relationshipId = request.nextUrl.searchParams.get("relationshipId") ?? "";
  const weekStart = request.nextUrl.searchParams.get("weekStart") ?? "";
  try {
    const { rel, weekId } = await context(token, relationshipId, weekStart);
    const therapySnap = await rel.ref.collection("weekly_therapy_summaries").doc(weekId).get();
    const reflectionSnap = token.uid === rel.patientUid ? await rel.ref.collection("weekly_reflections").doc(weekId).get() : null;
    const dek = await relationshipDek(relationshipId);
    try {
      const therapy = therapySnap.exists ? weeklyTherapySchema.parse(JSON.parse(decryptText(dek, therapySnap.data() as EncryptedPayload, `${relationshipId}:weekly:therapy:${weekId}`))) : null;
      const reflection = reflectionSnap?.exists ? weeklyReflectionSchema.parse(JSON.parse(decryptText(dek, reflectionSnap.data() as EncryptedPayload, `${relationshipId}:weekly:reflection:${weekId}`))) : null;
      return NextResponse.json({ therapy, reflection }, { headers: { "Cache-Control": "no-store" } });
    } finally { dek.fill(0); }
  } catch (error) { return fail(error); }
}
