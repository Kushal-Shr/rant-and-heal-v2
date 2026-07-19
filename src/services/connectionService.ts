import {
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  collection,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { Connection, ConnectionStatus } from "../types/database";

const COLLECTION_NAME = "connections";

/**
 * Initiates the patient-provider handshake.
 * This establishes the link and logs the cryptographic consent proof.
 * Uses the userId as the Document ID to strictly enforce a "One Therapist per Patient" rule.
 */
export async function requestConnection(
  patientUid: string, 
  therapistUid: string, 
  consentHash: string
): Promise<void> {
  const connectionRef = doc(db, COLLECTION_NAME, patientUid);

  // Check if an active connection already exists
  const existingSnap = await getDoc(connectionRef);
  if (existingSnap.exists()) {
    const data = existingSnap.data() as Connection;
    if (data.status === ConnectionStatus.ACTIVE || data.status === ConnectionStatus.PENDING) {
      throw new Error("You already have a therapist connection in progress.");
    }
  }

  const connectionData: Connection = {
    userId: patientUid ?? "",
    therapistId: therapistUid ?? "",
    status: ConnectionStatus.PENDING,
    consentHash: consentHash ?? "",
    requestedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // We use setDoc here because a new request safely overwrites a PENDING or REVOKED state
  await setDoc(connectionRef, connectionData);
}

export function observePatientConnection(
  patientUid: string,
  onChange: (connection: Connection | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const connectionRef = doc(db, COLLECTION_NAME, patientUid);

  return onSnapshot(
    connectionRef,
    (snap) => {
      onChange(snap.exists() ? ({ id: snap.id, ...snap.data() } as Connection) : null);
    },
    onError
  );
}

export async function revokeConnection(patientUid: string): Promise<void> {
  const connectionRef = doc(db, COLLECTION_NAME, patientUid);

  await updateDoc(connectionRef, {
    status: ConnectionStatus.REVOKED,
    updatedAt: serverTimestamp(),
  });
}

export function observePendingConnections(
  therapistUid: string,
  onChange: (connections: Connection[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const connectionsQuery = query(
    collection(db, COLLECTION_NAME),
    where("therapistId", "==", therapistUid),
    where("status", "==", ConnectionStatus.PENDING)
  );

  return onSnapshot(
    connectionsQuery,
    (snap) => {
      onChange(snap.docs.map((connectionDoc) => ({ id: connectionDoc.id, ...connectionDoc.data() } as Connection)));
    },
    onError
  );
}

export function observeActiveConnections(
  therapistUid: string,
  onChange: (connections: Connection[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const connectionsQuery = query(
    collection(db, COLLECTION_NAME),
    where("therapistId", "==", therapistUid),
    where("status", "==", ConnectionStatus.ACTIVE)
  );

  return onSnapshot(
    connectionsQuery,
    (snap) => {
      onChange(snap.docs.map((connectionDoc) => ({ id: connectionDoc.id, ...connectionDoc.data() } as Connection)));
    },
    onError
  );
}

export async function acceptConnection(patientUid: string): Promise<void> {
  await updateConnectionStatus(patientUid, ConnectionStatus.ACTIVE);
}

export async function rejectConnection(patientUid: string): Promise<void> {
  await updateConnectionStatus(patientUid, ConnectionStatus.REJECTED);
}

/**
 * Updates the connection status (e.g., Therapist accepts -> ACTIVE, or either party -> REVOKED)
 */
export async function updateConnectionStatus(
  userId: string,
  status: ConnectionStatus
): Promise<void> {
  const connectionRef = doc(db, COLLECTION_NAME, userId);

  await updateDoc(connectionRef, {
    status: status ?? ConnectionStatus.REVOKED,
    respondedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...(status === ConnectionStatus.ACTIVE ? { connectedAt: serverTimestamp() } : {}),
  });
}
