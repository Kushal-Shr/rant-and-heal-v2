import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { SAFETY_POLICY_VERSION } from "@/src/server/safety/classifier";
import { combineSafetyAssessments } from "@/src/lib/safety/detector";
import { safetyResponseFor } from "@/src/lib/safety/responses";
import type { SafetyEvaluation } from "@/src/lib/safety/schemas";
import type { MomoSafetyAssessment } from "./safetyAssessment";
export { assessMomoSafety } from "./safetyAssessment";
export type { MomoSafetyAssessment, MomoSafetyCategory, MomoSafetyLanguage } from "./safetyAssessment";

export function crisisReplyFor(assessment: MomoSafetyAssessment): string {
  return safetyResponseFor(combineSafetyAssessments(assessment), { language: assessment.language });
}

interface RecordMomoSafetyEventOptions {
  db: Firestore;
  userId: string;
  sessionId: string;
  userText: string;
  source: "TEXT" | "VOICE";
  evaluation: SafetyEvaluation;
  responseText: string;
}

// Store a minimal, server-only audit event. The original chat/transcript is
// already retained in the user's session, so no raw text is duplicated here.
export async function recordMomoSafetyEvent({
  db,
  userId,
  sessionId,
  userText,
  source,
  evaluation,
  responseText,
}: RecordMomoSafetyEventOptions): Promise<string> {
  const userRef = db.collection("users").doc(userId);
  const sessionRef = userRef.collection("sessions").doc(sessionId);
  const messagesRef = sessionRef.collection("messages");
  const safetyEventRef = userRef.collection("safety_events").doc();
  const batch = db.batch();

  batch.set(messagesRef.doc(), {
    text: userText,
    sender: "USER",
    source,
    provenance: "SERVER",
    order: 0,
    timestamp: FieldValue.serverTimestamp(),
  });
  batch.set(messagesRef.doc(), {
    text: responseText,
    sender: "MOMO",
    source: "SAFETY",
    provenance: "SERVER",
    order: 1,
    timestamp: FieldValue.serverTimestamp(),
  });
  batch.set(
    sessionRef,
    {
      title: userText.slice(0, 64),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  batch.set(safetyEventRef, {
    userId,
    level: evaluation.deterministic.level,
    state: evaluation.state,
    safetyResolution: evaluation.resolution,
    assessmentStep: evaluation.assessmentStep,
    requiresHumanReview: evaluation.requiresHumanReview,
    reviewUrgency: evaluation.reviewUrgency,
    triggerType: evaluation.triggerType,
    ...(evaluation.deterministic.category ? { category: evaluation.deterministic.category } : {}),
    matchedSignals: evaluation.deterministic.matchedSignals,
    source,
    sessionId,
    status: evaluation.escalationStatus,
    policyVersion: SAFETY_POLICY_VERSION,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    // Firestore TTL must be configured separately before this is relied on.
    expireAt: Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  await batch.commit();
  return safetyEventRef.id;
}
