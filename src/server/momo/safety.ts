import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { SAFETY_POLICY_VERSION } from "@/src/server/safety/classifier";
import type { MomoSafetyAssessment } from "./safetyAssessment";
export { assessMomoSafety } from "./safetyAssessment";
export type { MomoSafetyAssessment, MomoSafetyCategory, MomoSafetyLanguage } from "./safetyAssessment";

export function crisisReplyFor(assessment: MomoSafetyAssessment): string {
  if (assessment.language === "NE") {
    return "तपाईंले यो भन्नुभएकोमा धन्यवाद। अहिले तपाईंको सुरक्षा सबैभन्दा महत्त्वपूर्ण छ। कृपया तुरुन्तै आफ्नो स्थानीय आपतकालीन सेवामा फोन गर्नुहोस् वा नजिकको आपतकालीन उपचार केन्द्रमा जानुहोस्। सम्भव भए विश्वासिलो व्यक्तिलाई अहिले नै सम्पर्क गर्नुहोस् र एक्लै नबस्नुहोस्। म आपतकालीन सेवा होइन, तर तपाईंले Crisis Support पृष्ठबाट सम्पर्क विकल्पहरू हेर्न सक्नुहुन्छ।";
  }

  return "I’m really glad you told me. Your immediate safety matters most right now. Please call your local emergency services or go to the nearest emergency department. If you can, contact someone you trust right now and do not stay alone. I’m not an emergency service, but you can use the Crisis Support page for contact options.";
}

interface RecordMomoSafetyEventOptions {
  db: Firestore;
  userId: string;
  sessionId: string;
  userText: string;
  source: "TEXT" | "VOICE";
  assessment: MomoSafetyAssessment;
}

// Store a minimal, server-only audit event. The original chat/transcript is
// already retained in the user's session, so no raw text is duplicated here.
export async function recordMomoSafetyEvent({
  db,
  userId,
  sessionId,
  userText,
  source,
  assessment,
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
    text: crisisReplyFor(assessment),
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
    level: assessment.level,
    category: assessment.category,
    matchedSignals: assessment.matchedSignals,
    source,
    sessionId,
    status: "CRISIS_SUPPORT",
    policyVersion: SAFETY_POLICY_VERSION,
    createdAt: FieldValue.serverTimestamp(),
    // Firestore TTL must be configured separately before this is relied on.
    expireAt: Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  await batch.commit();
  return safetyEventRef.id;
}
