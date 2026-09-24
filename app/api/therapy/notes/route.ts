import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { verifyFirebaseBearerToken } from "@/src/server/auth";
import { requireRelationship, requireAiConsent, TherapyAccessError } from "@/src/server/therapy/access";
import { createCallDraft, createTextDraft, readNote, reviewNote } from "@/src/server/therapy/notes";
import { callInputSchema, noteContentSchema } from "@/src/lib/therapy/notes";
import { isGeminiBillingError } from "@/src/server/momo/gemini";
import { FEATURE_FLAGS } from "@/src/config/features";

export const runtime = "nodejs";
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("GENERATE_TEXT"), relationshipId: z.string().min(1).max(128), periodStart: z.string().datetime(), periodEnd: z.string().datetime() }).strict(),
  z.object({ action: z.literal("CREATE_CALL"), relationshipId: z.string().min(1).max(128), callId: z.string().min(1).max(128), organizeWithAi: z.boolean(), input: callInputSchema }).strict(),
  z.object({ action: z.literal("REVIEW"), relationshipId: z.string().min(1).max(128), noteId: z.string().min(1).max(128), content: noteContentSchema }).strict(),
]);
function fail(error: unknown) {
  if (error instanceof TherapyAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (isGeminiBillingError(error)) return NextResponse.json({ error: "Session note AI is temporarily unavailable.", code: "AI_BILLING_REQUIRED" }, { status: 503 });
  if (error instanceof ZodError) return NextResponse.json({ error: "AI returned an invalid session note" }, { status: 502 });
  if (error instanceof Error && /Invalid session window|No messages|Too many messages|Call must have ended|Only a draft|Messages require migration/.test(error.message)) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ error: "Session note unavailable" }, { status: 500 });
}

export async function GET(request: NextRequest) {
  const token = await verifyFirebaseBearerToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const relationshipId = request.nextUrl.searchParams.get("relationshipId") ?? "";
  if (!relationshipId || relationshipId.length > 128) return NextResponse.json({ error: "Invalid relationship" }, { status: 400 });
  try {
    const rel = await requireRelationship(token, relationshipId);
    const viewer = token.uid === rel.therapistUid ? "therapist" : "patient";
    const snapshots = await rel.ref.collection("session_notes").orderBy("periodEnd", "desc").limit(50).get();
    const notes = (await Promise.all(snapshots.docs.map((snap) => readNote(snap.ref, relationshipId, viewer)))).filter(Boolean);
    const consentCurrent = (await rel.ref.get()).data()?.consent?.version === (await import("@/src/lib/therapy/consent")).THERAPY_CONSENT_VERSION;
    return NextResponse.json({ notes, consentCurrent }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return fail(error); }
}

export async function POST(request: NextRequest) {
  const token = await verifyFirebaseBearerToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid note request" }, { status: 400 });
  try {
    const body = parsed.data;
    if (!FEATURE_FLAGS.AI_THERAPY_NOTES && (body.action === "GENERATE_TEXT" || (body.action === "CREATE_CALL" && body.organizeWithAi))) {
      return NextResponse.json({ error: "AI therapy notes are disabled.", code: "FEATURE_DISABLED" }, { status: 503 });
    }
    const rel = await requireRelationship(token, body.relationshipId, "therapist");
    if (body.action === "GENERATE_TEXT" || (body.action === "CREATE_CALL" && body.organizeWithAi)) await requireAiConsent(body.relationshipId);
    let result;
    if (body.action === "GENERATE_TEXT") result = await createTextDraft(rel.ref, body.relationshipId, new Date(body.periodStart), new Date(body.periodEnd));
    else if (body.action === "CREATE_CALL") result = await createCallDraft(rel.ref, body.relationshipId, body.callId, body.organizeWithAi, body.input);
    else result = await reviewNote(rel.ref.collection("session_notes").doc(body.noteId), body.relationshipId, token.uid, body.content);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return fail(error); }
}
