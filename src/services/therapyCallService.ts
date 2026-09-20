import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "../config/firebase";
import {
  TherapyCallSession,
  TherapyCallSignal,
  TherapyCallStatus,
  TherapyMessageSenderRole,
} from "../types/database";
import type { RTCIceServer } from "../types/therapy";

export async function createCallSession(relationshipId: string): Promise<string> {
  const caller = auth.currentUser;

  if (!caller) {
    throw new Error("You must be signed in to start a call.");
  }

  const idToken = await caller.getIdToken();
  const response = await fetch("/api/therapy/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ relationshipId }),
  });
  const payload = (await response.json().catch(() => null)) as {
    sessionId?: string;
    error?: string;
  } | null;

  if (!response.ok || !payload?.sessionId) {
    throw new Error(payload?.error ?? "Could not start the call.");
  }

  return payload.sessionId;
}

export function observeCallSession(
  relationshipId: string,
  sessionId: string,
  onChange: (session: TherapyCallSession | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, "therapy_relationships", relationshipId, "call_sessions", sessionId),
    (snap) => {
      onChange(snap.exists() ? ({ id: snap.id, ...snap.data() } as TherapyCallSession) : null);
    },
    onError
  );
}

export function observeOpenCallSessions(
  relationshipId: string,
  participantUid: string,
  participantRole: TherapyMessageSenderRole,
  onChange: (sessions: TherapyCallSession[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const participantField =
    participantRole === TherapyMessageSenderRole.THERAPIST
      ? "therapistId"
      : "patientId";
  const sessionsQuery = query(
    collection(db, "therapy_relationships", relationshipId, "call_sessions"),
    where(participantField, "==", participantUid)
  );

  return onSnapshot(
    sessionsQuery,
    (snap) => {
      const sessions = snap.docs
        .map((sessionDoc) => ({ id: sessionDoc.id, ...sessionDoc.data() } as TherapyCallSession))
        .filter((session) =>
          (session.status === TherapyCallStatus.RINGING ||
            session.status === TherapyCallStatus.ACTIVE) &&
          ("toMillis" in session.expiresAt ? session.expiresAt.toMillis() > Date.now() : false)
        )
        .sort((left, right) => {
          const leftMillis = "toMillis" in left.createdAt ? left.createdAt.toMillis() : 0;
          const rightMillis = "toMillis" in right.createdAt ? right.createdAt.toMillis() : 0;
          return rightMillis - leftMillis;
        });

      onChange(sessions);
    },
    onError
  );
}

export async function sendSignal(
  relationshipId: string,
  sessionId: string,
  signal: Pick<TherapyCallSignal, "type" | "payload">
): Promise<void> {
  const senderId = auth.currentUser?.uid;

  if (!senderId) {
    throw new Error("You must be signed in to signal a call.");
  }

  await addDoc(collection(db, "therapy_relationships", relationshipId, "call_sessions", sessionId, "signals"), {
    ...signal,
    senderId,
    createdAt: serverTimestamp(),
  });
}

export function observeSignals(
  relationshipId: string,
  sessionId: string,
  onChange: (signals: TherapyCallSignal[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, "therapy_relationships", relationshipId, "call_sessions", sessionId, "signals"),
    (snap) => {
      onChange(snap.docs.map((signalDoc) => ({ id: signalDoc.id, ...signalDoc.data() } as TherapyCallSignal)));
    },
    onError
  );
}

export async function answerCallSession(relationshipId: string, sessionId: string): Promise<void> {
  await updateCallSession(relationshipId, sessionId, "ANSWER");
}

export async function declineCallSession(relationshipId: string, sessionId: string): Promise<void> {
  await updateCallSession(relationshipId, sessionId, "DECLINE");
}

export async function endCallSession(relationshipId: string, sessionId: string): Promise<void> {
  try {
    await sendSignal(relationshipId, sessionId, {
      type: "hangup",
      payload: {},
    });
  } catch (signalError) {
    // The authoritative state transition below still ends the call if the
    // signaling write races with a disconnect or another participant ending.
    console.warn("Could not send hangup signal:", signalError);
  }

  await updateCallSession(relationshipId, sessionId, "END");
}

export async function getCallIceServers(
  relationshipId: string,
  sessionId: string
): Promise<RTCIceServer[]> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("You must be signed in to join a call.");

  const idToken = await currentUser.getIdToken();
  const response = await fetch("/api/therapy/ice-servers", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ relationshipId, sessionId }),
  });
  const payload = (await response.json().catch(() => null)) as {
    iceServers?: RTCIceServer[];
    error?: string;
  } | null;
  if (!response.ok || !payload?.iceServers?.length) {
    throw new Error(payload?.error ?? "Could not prepare the call connection.");
  }

  return payload.iceServers;
}

async function updateCallSession(
  relationshipId: string,
  sessionId: string,
  action: "ANSWER" | "DECLINE" | "END"
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("You must be signed in to update a call.");

  const idToken = await currentUser.getIdToken();
  const response = await fetch(`/api/therapy/calls/${sessionId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ relationshipId, action }),
  });
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error ?? "Could not update the call.");
}
