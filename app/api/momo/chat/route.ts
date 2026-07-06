import { NextResponse, type NextRequest } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { Content } from "@google/genai";
import { verifyFirebaseBearerToken } from "@/src/server/auth";
import { getAdminDb } from "@/src/server/firebaseAdmin";
import { getErrorMessage } from "@/src/server/errors";
import { getGeminiClient, MOMO_TEXT_MODEL } from "@/src/server/momo/gemini";
import { MOMO_SYSTEM_INSTRUCTION } from "@/src/server/momo/persona";

export const runtime = "nodejs";

const HISTORY_LIMIT = 12;

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

function formatHistoryForGemini(messages: StoredMessage[]): Content[] {
  return messages
    .filter((message) => typeof message.text === "string" && message.text.trim().length > 0)
    .map((message) => ({
      role: message.sender === "MOMO" ? "model" : "user",
      parts: [{ text: message.text!.trim() }],
    }));
}

export async function POST(request: NextRequest) {
  try {
    const decodedToken = await verifyFirebaseBearerToken(request);

    if (!decodedToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as ChatRequestBody;
    const userId = body.userId?.trim();
    const sessionId = body.sessionId?.trim();
    const messageText = body.messageText?.trim();

    if (!userId || !sessionId || !messageText) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (decodedToken.uid !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const adminDb = getAdminDb();
    const sessionRef = adminDb.collection("users").doc(userId).collection("sessions").doc(sessionId);
    const messagesRef = sessionRef.collection("messages");
    const historySnapshot = await messagesRef
      .orderBy("timestamp", "asc")
      .limitToLast(HISTORY_LIMIT)
      .get();

    const conversationHistory = formatHistoryForGemini(
      historySnapshot.docs.map((docSnapshot) => docSnapshot.data() as StoredMessage)
    );

    const contents: Content[] = [
      ...conversationHistory,
      {
        role: "user",
        parts: [{ text: messageText }],
      },
    ];

    const generationResult = await getGeminiClient().models.generateContent({
      model: MOMO_TEXT_MODEL,
      contents,
      config: {
        systemInstruction: MOMO_SYSTEM_INSTRUCTION,
      },
    });
    const momoReply = generationResult.text?.trim();

    if (!momoReply) {
      throw new Error("Gemini returned an empty response.");
    }

    const batch = adminDb.batch();
    batch.set(messagesRef.doc(), {
      text: messageText,
      sender: "USER",
      timestamp: FieldValue.serverTimestamp(),
    });
    batch.set(messagesRef.doc(), {
      text: momoReply,
      sender: "MOMO",
      timestamp: FieldValue.serverTimestamp(),
    });
    batch.set(
      sessionRef,
      {
        title: messageText.slice(0, 64),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await batch.commit();

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
