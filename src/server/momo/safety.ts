import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { SAFETY_POLICY_VERSION } from "@/src/server/safety/classifier";
import { combineSafetyAssessments } from "@/src/lib/safety/detector";
import { safetyResponseFor } from "@/src/lib/safety/responses";
import type { SafetyEvaluation } from "@/src/lib/safety/schemas";
import { createOrUpdateSafetyCaseInTransaction } from "@/src/server/safety/cases";
import { encryptSafetyExcerpt, type SafetyExcerptEnvelope } from "@/src/server/momo/crypto";
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
}

// Store a minimal, server-only audit event. Review-required evaluations also
// create/update a bounded case containing only the triggering text reviewers
// need; the event itself still does not duplicate chat plaintext.
export async function recordMomoSafetyEvent({
  db,
  userId,
  sessionId,
  userText,
  source,
  evaluation,
}: RecordMomoSafetyEventOptions): Promise<string> {
  const userRef = db.collection("users").doc(userId);
  const sessionRef = userRef.collection("sessions").doc(sessionId);
  const safetyEventRef = userRef.collection("safety_events").doc();
  let safetyExcerpt: SafetyExcerptEnvelope | null = null;
  if (evaluation.requiresHumanReview) {
    try {
      safetyExcerpt = await encryptSafetyExcerpt(userText, safetyEventRef.id);
    } catch (error) {
      // Mandatory structured safety state must survive an excerpt-encryption
      // outage. Fail closed on content: never substitute plaintext.
      console.error("SAFETY EXCERPT ENCRYPTION FAILED", {
        eventId: safetyEventRef.id,
        status: error instanceof Error ? error.name : "UNKNOWN",
      });
    }
  }
  let safetyCaseId: string | null = null;
  await db.runTransaction(async (transaction) => {
    safetyCaseId = await createOrUpdateSafetyCaseInTransaction({
      db,
      transaction,
      eventId: safetyEventRef.id,
      userId,
      sessionId,
      source,
      evaluation,
      safetyExcerpt,
    });
    transaction.set(
      sessionRef,
      {
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    transaction.set(safetyEventRef, {
      userId,
      level: evaluation.deterministic.level,
      state: evaluation.state,
      safetyResolution: evaluation.resolution,
      assessmentStep: evaluation.assessmentStep,
      requiresHumanReview: evaluation.requiresHumanReview,
      reviewUrgency: evaluation.reviewUrgency,
      triggerType: evaluation.triggerType,
      safetyTarget: evaluation.safetyTarget,
      ...(evaluation.deterministic.category ? { category: evaluation.deterministic.category } : {}),
      matchedSignals: evaluation.deterministic.matchedSignals,
      source,
      sessionId,
      classifierSource: "AUTHORITATIVE_MOMO_SAFETY_PIPELINE",
      status: evaluation.escalationStatus,
      policyVersion: SAFETY_POLICY_VERSION,
      ...(safetyCaseId ? { safetyCaseId } : {}),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      // Firestore TTL must be configured separately before this is relied on.
      expireAt: Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
  });
  if (safetyCaseId) {
    console.info("SAFETY CASE UPSERT COMMITTED", {
      caseId: safetyCaseId,
      eventId: safetyEventRef.id,
      state: evaluation.state,
    });
  }
  return safetyEventRef.id;
}
