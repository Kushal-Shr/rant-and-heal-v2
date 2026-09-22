import { Timestamp, type DocumentReference } from "firebase-admin/firestore";
import { ThinkingLevel } from "@google/genai";
import { getGeminiClient } from "@/src/server/momo/gemini";
import { AI_MODELS } from "@/src/lib/ai/models";
import { callInputSchema, noteContentSchema, noteJsonSchema, THERAPY_NOTE_INSTRUCTION, THERAPY_NOTE_PROMPT_VERSION, type NoteContent } from "@/src/lib/therapy/notes";
import { decryptText, encryptText, type EncryptedPayload } from "./crypto";
import { relationshipDek } from "./access";

export async function generateNote(source: string): Promise<NoteContent> {
  const result = await getGeminiClient().models.generateContent({
    model: AI_MODELS.THERAPY_NOTE,
    contents: [{ role: "user", parts: [{ text: source }] }],
    config: { systemInstruction: THERAPY_NOTE_INSTRUCTION, thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
      responseMimeType: "application/json", responseJsonSchema: noteJsonSchema },
  });
  if (!result.text) throw new Error("AI returned an empty note");
  return noteContentSchema.parse(JSON.parse(result.text));
}

async function createNoteIfActive(relationshipRef: DocumentReference, noteRef: DocumentReference, data: Record<string, unknown>) {
  await relationshipRef.firestore.runTransaction(async (tx) => {
    const rel = (await tx.get(relationshipRef)).data();
    if (!rel || rel.status !== "ACTIVE") throw new Error("Relationship unavailable");
    const pointer = (await tx.get(relationshipRef.firestore.collection("connections").doc(rel.userId))).data();
    if (pointer?.relationshipId !== relationshipRef.id || pointer.status !== "ACTIVE") throw new Error("Relationship unavailable");
    tx.create(noteRef, data);
  });
}

export async function createTextDraft(relationshipRef: DocumentReference, relationshipId: string, periodStart: Date, periodEnd: Date) {
  if (periodEnd.getTime() <= periodStart.getTime() || periodEnd.getTime() - periodStart.getTime() > 7 * 86400000) throw new Error("Invalid session window");
  const messages = await relationshipRef.collection("messages")
    .where("createdAt", ">=", Timestamp.fromDate(periodStart))
    .where("createdAt", "<=", Timestamp.fromDate(periodEnd))
    .orderBy("createdAt", "asc").limit(101).get();
  if (messages.empty) throw new Error("No messages in this window");
  if (messages.size > 100) throw new Error("Too many messages in this window; choose a shorter period");
  const dek = await relationshipDek(relationshipId);
  try {
    const source = messages.docs.map((snap) => {
      const data = snap.data();
      if (!data.ciphertext || data.text !== undefined) throw new Error("Messages require migration before AI processing");
      const line = decryptText(dek, data as EncryptedPayload, `${relationshipId}:message:${snap.id}`);
      return `${data.senderRole === "USER" ? "USER_REPORTED" : "THERAPIST_STATED"}: ${line}`;
    }).join("\n");
    const content = await generateNote(source);
    const ref = relationshipRef.collection("session_notes").doc();
    const encrypted = encryptText(dek, JSON.stringify(content), `${relationshipId}:note:${ref.id}:draft`);
    await createNoteIfActive(relationshipRef, ref, { relationshipId, source: "TEXT_CHAT", periodStart: Timestamp.fromDate(periodStart),
      periodEnd: Timestamp.fromDate(periodEnd), status: "AI_DRAFT", aiDraft: {
        ...encrypted, generatedAt: Timestamp.now(), model: AI_MODELS.THERAPY_NOTE,
        promptVersion: THERAPY_NOTE_PROMPT_VERSION,
      }, messageCount: messages.size, createdAt: Timestamp.now() });
    return { id: ref.id, status: "AI_DRAFT", content };
  } finally { dek.fill(0); }
}

export async function createCallDraft(relationshipRef: DocumentReference, relationshipId: string, callId: string, organizeWithAi: boolean, input: unknown) {
  const parsed = callInputSchema.parse(input);
  const session = (await relationshipRef.collection("call_sessions").doc(callId).get()).data();
  if (!session || session.status !== "ENDED" || !session.endedAt) throw new Error("Call must have ended");
  const source = JSON.stringify(parsed);
  const content: NoteContent = organizeWithAi ? await generateNote(source) : {
    summary: parsed.focus, userReportedConcerns: parsed.userConcerns ? [parsed.userConcerns] : [],
    topicsDiscussed: parsed.focus ? [parsed.focus] : [], strategiesDiscussed: parsed.strategies ? [parsed.strategies] : [],
    goalsAgreed: parsed.goals ? [parsed.goals] : [], followUpItems: parsed.followUp ? [parsed.followUp] : [], evidence: [],
  };
  const ref = relationshipRef.collection("session_notes").doc(callId);
  const dek = await relationshipDek(relationshipId);
  try {
    const encrypted = encryptText(dek, JSON.stringify(content), `${relationshipId}:note:${ref.id}:${organizeWithAi ? "draft" : "reviewed"}`);
    await createNoteIfActive(relationshipRef, ref, { relationshipId, callSessionId: callId, source: "VIDEO_CALL", periodStart: session.createdAt,
      periodEnd: session.endedAt, status: organizeWithAi ? "AI_DRAFT" : "THERAPIST_REVIEWED",
      [organizeWithAi ? "aiDraft" : "reviewed"]: { ...encrypted,
        generatedAt: Timestamp.now(), model: organizeWithAi ? AI_MODELS.THERAPY_NOTE : "THERAPIST_ENTRY",
        promptVersion: organizeWithAi ? THERAPY_NOTE_PROMPT_VERSION : "manual-v1",
        ...(!organizeWithAi ? { reviewedBy: session.therapistId, reviewedAt: Timestamp.now() } : {}) }, createdAt: Timestamp.now() });
    return { id: ref.id, status: organizeWithAi ? "AI_DRAFT" : "THERAPIST_REVIEWED", content };
  } finally { dek.fill(0); }
}

export async function readNote(ref: DocumentReference, relationshipId: string, viewer: "patient" | "therapist") {
  const snap = await ref.get();
  const data = snap.data();
  if (!data) return null;
  if (viewer === "patient" && data.status !== "THERAPIST_REVIEWED") return null;
  const field = data.status === "THERAPIST_REVIEWED" ? "reviewed" : "aiDraft";
  const encrypted = data[field] as EncryptedPayload;
  const dek = await relationshipDek(relationshipId);
  try {
    return { id: ref.id, relationshipId, source: data.source, status: data.status,
      periodStart: data.periodStart.toMillis(), periodEnd: data.periodEnd.toMillis(),
      content: noteContentSchema.parse(JSON.parse(decryptText(dek, encrypted, `${relationshipId}:note:${ref.id}:${field === "aiDraft" ? "draft" : "reviewed"}`))) };
  } finally { dek.fill(0); }
}

export async function reviewNote(ref: DocumentReference, relationshipId: string, therapistUid: string, input: unknown) {
  const content = noteContentSchema.parse(input);
  const dek = await relationshipDek(relationshipId);
  try {
    const encrypted = encryptText(dek, JSON.stringify(content), `${relationshipId}:note:${ref.id}:reviewed`);
    await ref.firestore.runTransaction(async (tx) => {
      const [snap, relSnap] = await Promise.all([tx.get(ref), tx.get(ref.parent.parent!)]);
      if (relSnap.data()?.status !== "ACTIVE" || relSnap.data()?.therapistId !== therapistUid) throw new Error("Relationship unavailable");
      const pointer = (await tx.get(ref.firestore.collection("connections").doc(relSnap.data()!.userId))).data();
      if (pointer?.relationshipId !== relationshipId || pointer.status !== "ACTIVE") throw new Error("Relationship unavailable");
      if (!snap.exists || snap.data()?.status !== "AI_DRAFT") throw new Error("Only a draft can be reviewed");
      tx.update(ref, { status: "THERAPIST_REVIEWED", reviewed: { ...encrypted,
        reviewedBy: therapistUid, reviewedAt: Timestamp.now() } });
    });
    return { id: ref.id, status: "THERAPIST_REVIEWED", content };
  } finally { dek.fill(0); }
}
