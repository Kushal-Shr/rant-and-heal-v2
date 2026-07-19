import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "../config/firebase";
import { TherapyCallSession, TherapyCallSignal, TherapyCallStatus } from "../types/database";

export async function createCallSession(patientUid: string, therapistUid?: string): Promise<string> {
  const startedBy = auth.currentUser?.uid;

  if (!startedBy) {
    throw new Error("You must be signed in to start a call.");
  }

  const sessionRef = await addDoc(collection(db, "connections", patientUid, "call_sessions"), {
    patientId: patientUid,
    therapistId: therapistUid ?? "",
    startedBy,
    status: TherapyCallStatus.RINGING,
    createdAt: serverTimestamp(),
  });

  return sessionRef.id;
}

export function observeCallSession(
  patientUid: string,
  sessionId: string,
  onChange: (session: TherapyCallSession | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, "connections", patientUid, "call_sessions", sessionId),
    (snap) => {
      onChange(snap.exists() ? ({ id: snap.id, ...snap.data() } as TherapyCallSession) : null);
    },
    onError
  );
}

export function observeOpenCallSessions(
  patientUid: string,
  onChange: (sessions: TherapyCallSession[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, "connections", patientUid, "call_sessions"),
    (snap) => {
      const sessions = snap.docs
        .map((sessionDoc) => ({ id: sessionDoc.id, ...sessionDoc.data() } as TherapyCallSession))
        .filter((session) => session.status !== TherapyCallStatus.ENDED);

      onChange(sessions);
    },
    onError
  );
}

export async function sendSignal(
  patientUid: string,
  sessionId: string,
  signal: Pick<TherapyCallSignal, "type" | "payload">
): Promise<void> {
  const senderId = auth.currentUser?.uid;

  if (!senderId) {
    throw new Error("You must be signed in to signal a call.");
  }

  await addDoc(collection(db, "connections", patientUid, "call_sessions", sessionId, "signals"), {
    ...signal,
    senderId,
    createdAt: serverTimestamp(),
  });
}

export function observeSignals(
  patientUid: string,
  sessionId: string,
  onChange: (signals: TherapyCallSignal[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, "connections", patientUid, "call_sessions", sessionId, "signals"),
    (snap) => {
      onChange(snap.docs.map((signalDoc) => ({ id: signalDoc.id, ...signalDoc.data() } as TherapyCallSignal)));
    },
    onError
  );
}

export async function markCallSessionActive(patientUid: string, sessionId: string): Promise<void> {
  await updateDoc(doc(db, "connections", patientUid, "call_sessions", sessionId), {
    status: TherapyCallStatus.ACTIVE,
  });
}

export async function endCallSession(patientUid: string, sessionId: string): Promise<void> {
  await updateDoc(doc(db, "connections", patientUid, "call_sessions", sessionId), {
    status: TherapyCallStatus.ENDED,
    endedAt: serverTimestamp(),
  });

  await sendSignal(patientUid, sessionId, {
    type: "hangup",
    payload: {},
  });
}
