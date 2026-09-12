import { FieldValue, type Firestore } from "firebase-admin/firestore";

export type MomoSafetyCategory = "SELF_HARM" | "HARM_TO_OTHERS";
export type MomoSafetyLanguage = "EN" | "NE";

export interface MomoSafetyAssessment {
  level: "SAFE" | "URGENT";
  category?: MomoSafetyCategory;
  language?: MomoSafetyLanguage;
  matchedSignals: string[];
}

interface SafetyPattern {
  id: string;
  category: MomoSafetyCategory;
  language: MomoSafetyLanguage;
  expression: RegExp;
}

// This is a deliberately narrow, conservative first-pass screen. It is not a
// clinical assessment and must be expanded/reviewed with the clinical team.
const URGENT_PATTERNS: SafetyPattern[] = [
  { id: "self-harm-direct", category: "SELF_HARM", language: "EN", expression: /\b(?:kill|hurt|harm|cut)\s+myself\b/i },
  { id: "self-harm-intent", category: "SELF_HARM", language: "EN", expression: /\b(?:want|plan|going|about)\s+to\s+(?:die|end\s+my\s+life)\b/i },
  { id: "suicide-intent", category: "SELF_HARM", language: "EN", expression: /\b(?:suicidal\s+(?:thoughts?|ideas?|intent|plan)|(?:commit|attempt)\s+suicide)\b/i },
  { id: "harm-others-direct", category: "HARM_TO_OTHERS", language: "EN", expression: /\b(?:kill|hurt|harm|attack|shoot)\s+(?:him|her|them|someone|people|my\s+(?:partner|family|friend|boss))\b/i },
  { id: "harm-others-intent", category: "HARM_TO_OTHERS", language: "EN", expression: /\b(?:going|plan(?:ning)?|want)\s+to\s+(?:kill|hurt|harm|attack|shoot)\b/i },
  { id: "self-harm-nepali", category: "SELF_HARM", language: "NE", expression: /(?:आत्महत्या|आफैलाई\s*मार|आफ्नो\s*ज्यान|मर्न\s*मन|बाँच्न\s*मन\s*छैन)/i },
  { id: "harm-others-nepali", category: "HARM_TO_OTHERS", language: "NE", expression: /(?:उसलाई\s*मार|मान्छे\s*मार|कसैलाई\s*मार|हान्न\s*जान्छु)/i },
  { id: "self-harm-romanized-nepali", category: "SELF_HARM", language: "NE", expression: /\b(?:aatmahatya|afulai\s*mar|aafailai\s*mar|aafno\s*jyan|marna\s*man|bachna\s*man\s*chaina)\b/i },
  { id: "harm-others-romanized-nepali", category: "HARM_TO_OTHERS", language: "NE", expression: /\b(?:uslai\s*mar|manche\s*mar|kasailai\s*mar|hanne\s*janxu)\b/i },
];

export function assessMomoSafety(text: string): MomoSafetyAssessment {
  const normalizedText = text.normalize("NFKC").trim();
  const matchedPatterns = URGENT_PATTERNS.filter((pattern) => pattern.expression.test(normalizedText));

  if (matchedPatterns.length === 0) {
    return { level: "SAFE", matchedSignals: [] };
  }

  const primaryMatch = matchedPatterns[0];
  return {
    level: "URGENT",
    category: primaryMatch.category,
    language: primaryMatch.language,
    matchedSignals: matchedPatterns.map((pattern) => pattern.id),
  };
}

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
}: RecordMomoSafetyEventOptions): Promise<void> {
  const userRef = db.collection("users").doc(userId);
  const sessionRef = userRef.collection("sessions").doc(sessionId);
  const messagesRef = sessionRef.collection("messages");
  const safetyEventRef = userRef.collection("safety_events").doc();
  const batch = db.batch();

  batch.set(messagesRef.doc(), {
    text: userText,
    sender: "USER",
    source,
    timestamp: FieldValue.serverTimestamp(),
  });
  batch.set(messagesRef.doc(), {
    text: crisisReplyFor(assessment),
    sender: "MOMO",
    source: "SAFETY",
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
    createdAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();
}
