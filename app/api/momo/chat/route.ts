import { NextResponse, type NextRequest } from "next/server";
import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { GoogleGenerativeAI, type Content } from "@google/generative-ai";

export const runtime = "nodejs";

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const HISTORY_LIMIT = 12;
const SYSTEM_INSTRUCTION = `
You are Momo, an empathetic and supportive AI companion for the platform "Rant and Heal".
You help patients feel heard, grounded, and emotionally supported.
You must maintain clear clinical boundaries at all times.
Do not diagnose medical or psychiatric conditions.
Do not claim to be a therapist, doctor, emergency responder, or crisis hotline.
Encourage reflection, coping skills, emotional regulation, and seeking professional support when appropriate.
If the user expresses self-harm intent, suicidal intent, intent to harm others, or severe crisis risk, immediately shift into crisis wording:
- acknowledge the urgency directly and compassionately
- encourage the user to contact local emergency services or a crisis hotline immediately
- encourage them to reach out to a trusted nearby person right now
- keep the response supportive, brief, and safety-focused
Never provide instructions for self-harm or violence.
`;

interface ChatRequestBody {
  userId?: string;
  sessionId?: string;
  messageText?: string;
}

interface StoredMessage {
  sender?: "USER" | "MOMO";
  text?: string;
  timestamp?: Timestamp | null;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getFirebaseAdminApp(): App {
  if (getApps().length > 0) {
    return getApps()[0]!;
  }

  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase Admin credentials. Expected FIREBASE_ADMIN_PROJECT_ID (or NEXT_PUBLIC_FIREBASE_PROJECT_ID), FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY."
    );
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

function extractBearerToken(request: NextRequest): string | null {
  const authorizationHeader = request.headers.get("authorization");

  if (!authorizationHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authorizationHeader.slice("Bearer ".length).trim();
}

function formatHistoryForGemini(messages: StoredMessage[]): Content[] {
  return messages
    .filter((message) => typeof message.text === "string" && message.text.trim().length > 0)
    .map((message) => ({
      role: message.sender === "MOMO" ? "model" : "user",
      parts: [{ text: message.text!.trim() }],
    }));
}

function isDuplicateLatestUserTurn(history: Content[], messageText: string): boolean {
  const latestTurn = history[history.length - 1];
  const latestText = latestTurn?.parts?.[0]?.text;

  return latestTurn?.role === "user" && typeof latestText === "string" && latestText.trim() === messageText;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request);

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as ChatRequestBody;
    const userId = body.userId?.trim();
    const sessionId = body.sessionId?.trim();
    const messageText = body.messageText?.trim();

    if (!userId || !sessionId || !messageText) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const adminApp = getFirebaseAdminApp();
    const adminAuth = getAuth(adminApp);
    const adminDb = getFirestore(adminApp);

    const decodedToken = await adminAuth.verifyIdToken(token);

    if (decodedToken.uid !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const messagesRef = adminDb
      .collection("users")
      .doc(userId)
      .collection("sessions")
      .doc(sessionId)
      .collection("messages");

    const historySnapshot = await messagesRef
      .orderBy("timestamp", "asc")
      .limitToLast(HISTORY_LIMIT)
      .get();

    const conversationHistory = formatHistoryForGemini(
      historySnapshot.docs.map((docSnapshot) => docSnapshot.data() as StoredMessage)
    );

    const geminiClient = new GoogleGenerativeAI(getRequiredEnv("GEMINI_API_KEY"));
    const model = geminiClient.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: SYSTEM_INSTRUCTION,
    });

    const contents: Content[] = isDuplicateLatestUserTurn(conversationHistory, messageText)
      ? conversationHistory
      : [
          ...conversationHistory,
          {
            role: "user",
            parts: [{ text: messageText }],
          },
        ];

    const generationResult = await model.generateContent({ contents });
    const momoReply = generationResult.response.text().trim();

    if (!momoReply) {
      throw new Error("Gemini returned an empty response.");
    }

    await messagesRef.add({
      text: momoReply,
      sender: "MOMO",
      timestamp: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ message: momoReply }, { status: 200 });
  } catch (error) {
    const detail = getErrorMessage(error);
    console.error("MOMO CHAT API ERROR:", detail, error);

    return NextResponse.json(
      {
        error: process.env.NODE_ENV === "production" ? "Failed to process message" : detail,
      },
      { status: 500 }
    );
  }
}
