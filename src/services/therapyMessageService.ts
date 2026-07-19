import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "../config/firebase";
import { TherapyMessage, TherapyMessageSenderRole } from "../types/database";

export function observeTherapyMessages(
  patientUid: string,
  onChange: (messages: TherapyMessage[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const messagesQuery = query(
    collection(db, "connections", patientUid, "messages"),
    orderBy("createdAt", "asc")
  );

  return onSnapshot(
    messagesQuery,
    (snap) => {
      onChange(snap.docs.map((messageDoc) => ({ id: messageDoc.id, ...messageDoc.data() } as TherapyMessage)));
    },
    onError
  );
}

export async function sendTherapyMessage(
  patientUid: string,
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

  await addDoc(collection(db, "connections", patientUid, "messages"), {
    text: trimmedText,
    senderId,
    senderRole,
    createdAt: serverTimestamp(),
  });

  await updateDoc(doc(db, "connections", patientUid), {
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
