import {
  doc,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/src/config/firebase";
import type { ConversationContinuityState } from "@/src/lib/momo/schemas";
import {
  decryptMomoMessage,
  decryptMomoContinuity,
  encryptMomoContinuity,
  encryptMomoMessage,
  importMomoConversationKey,
  type EncryptedMomoContent,
  type MomoMessageModality,
  type MomoMessageRole,
} from "@/src/lib/momo/storageCrypto";
import { conversationContinuityStateSchema } from "@/src/lib/momo/schemas";

export interface DecryptedMomoMessage {
  id: string;
  sender: "USER" | "MOMO";
  text: string;
  modality: MomoMessageModality;
  createdAt: Timestamp | null;
  messageSequence: number;
}

interface StoredEncryptedMessage {
  userId?: string;
  conversationId?: string;
  role?: MomoMessageRole;
  modality?: MomoMessageModality;
  encryptedContent?: EncryptedMomoContent;
  createdAt?: Timestamp | null;
  messageSequence?: number;
}

function validEncryptedContent(value: unknown): value is EncryptedMomoContent {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<EncryptedMomoContent>;
  return item.algorithm === "AES-256-GCM" && item.cryptoVersion === 1 &&
    typeof item.ciphertext === "string" && typeof item.iv === "string";
}

export async function getMomoConversationKey(
  idToken: string,
  conversationId: string
): Promise<CryptoKey> {
  const response = await fetch("/api/momo/conversation-key", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId }),
  });
  const payload = await response.json().catch(() => null) as { key?: string; error?: string } | null;
  if (!response.ok || !payload?.key) throw new Error(payload?.error ?? "Conversation key unavailable.");
  return importMomoConversationKey(payload.key);
}

export async function decryptMomoDocuments(
  key: CryptoKey,
  userId: string,
  conversationId: string,
  documents: QueryDocumentSnapshot<DocumentData>[]
): Promise<DecryptedMomoMessage[]> {
  const decrypted = await Promise.all(documents.map(async (messageDoc) => {
    const data = messageDoc.data() as StoredEncryptedMessage;
    if (data.userId !== userId || data.conversationId !== conversationId ||
        (data.role !== "user" && data.role !== "assistant") ||
        (data.modality !== "text" && data.modality !== "voice") ||
        !validEncryptedContent(data.encryptedContent)) {
      throw new Error("This conversation contains a message that has not been securely migrated.");
    }
    const text = await decryptMomoMessage(key, data.encryptedContent, {
      userId,
      conversationId,
      messageId: messageDoc.id,
      role: data.role,
      modality: data.modality,
    });
    return {
      id: messageDoc.id,
      sender: data.role === "user" ? "USER" as const : "MOMO" as const,
      text,
      modality: data.modality,
      createdAt: data.createdAt ?? null,
      messageSequence: typeof data.messageSequence === "number" ? data.messageSequence : 0,
    };
  }));
  return decrypted.sort((left, right) => {
    const time = (left.createdAt?.toMillis() ?? 0) - (right.createdAt?.toMillis() ?? 0);
    return time || left.messageSequence - right.messageSequence || left.id.localeCompare(right.id);
  });
}

export async function decryptStoredMomoContinuity(
  key: CryptoKey,
  payload: EncryptedMomoContent | undefined,
  userId: string,
  conversationId: string
): Promise<ConversationContinuityState | undefined> {
  if (!payload) return undefined;
  if (!validEncryptedContent(payload)) throw new Error("The saved continuity state is invalid.");
  const value = await decryptMomoContinuity<unknown>(key, payload, userId, conversationId);
  return conversationContinuityStateSchema.parse(value);
}

export async function persistEncryptedMomoTurn(options: {
  key: CryptoKey;
  userId: string;
  conversationId: string;
  requestId: string;
  userText: string;
  momoText: string;
  modality: MomoMessageModality;
  continuityState: ConversationContinuityState;
}): Promise<void> {
  const { key, userId, conversationId, requestId, userText, momoText, modality, continuityState } = options;
  const userMessageId = `${requestId}-user`;
  const momoMessageId = `${requestId}-momo`;
  const [userContent, momoContent, encryptedContinuity] = await Promise.all([
    encryptMomoMessage(key, userText, {
      userId, conversationId, messageId: userMessageId, role: "user", modality,
    }),
    encryptMomoMessage(key, momoText, {
      userId, conversationId, messageId: momoMessageId, role: "assistant", modality,
    }),
    encryptMomoContinuity(key, continuityState, userId, conversationId),
  ]);

  const batch = writeBatch(db);
  const sessionRef = doc(db, "users", userId, "sessions", conversationId);
  const sequence = Date.now() * 10;
  batch.set(doc(sessionRef, "messages", userMessageId), {
    userId,
    conversationId,
    role: "user",
    modality,
    encryptedContent: userContent,
    messageSequence: sequence,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(sessionRef, "messages", momoMessageId), {
    userId,
    conversationId,
    role: "assistant",
    modality,
    encryptedContent: momoContent,
    messageSequence: sequence + 1,
    createdAt: serverTimestamp(),
  });
  batch.update(sessionRef, {
    encryptedContinuity,
    cryptoVersion: 1,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}
