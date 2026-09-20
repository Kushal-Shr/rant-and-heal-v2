import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "../config/firebase";
import { TherapyMessage, TherapyMessageSenderRole } from "../types/database";

export function observeTherapyMessages(
  relationshipId: string,
  onChange: (messages: TherapyMessage[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const messagesQuery = query(
    collection(db, "therapy_relationships", relationshipId, "messages"),
    orderBy("createdAt", "desc"),
    limit(100)
  );

  return onSnapshot(
    messagesQuery,
    (snap) => {
      onChange(snap.docs.map((messageDoc) => ({ id: messageDoc.id, ...messageDoc.data() } as TherapyMessage)).reverse());
    },
    onError
  );
}

export async function sendTherapyMessage(
  relationshipId: string,
  text: string,
  senderRole: TherapyMessageSenderRole
): Promise<void> {
  const senderId = auth.currentUser?.uid;
  const trimmedText = text.trim();

  if (!senderId) {
    throw new Error("You must be signed in to send a message.");
  }

  if (!trimmedText) {
    throw new Error("Message cannot be empty.");
  }
  if (trimmedText.length > 4000) throw new Error("Messages can be up to 4,000 characters.");

  const relationshipRef = doc(db, "therapy_relationships", relationshipId);
  const messageRef = doc(collection(relationshipRef, "messages"), crypto.randomUUID());
  const batch = writeBatch(db);
  batch.set(messageRef, {
    text: trimmedText,
    senderId,
    senderRole,
    createdAt: serverTimestamp(),
  });

  batch.update(relationshipRef, {
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}
