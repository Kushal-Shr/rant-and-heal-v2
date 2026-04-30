import { doc, setDoc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
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
    if (data.status === ConnectionStatus.ACTIVE) {
      throw new Error("Patient already has an active connection with a therapist. Revoke it before requesting a new one.");
    }
  }

  const connectionData: Connection = {
    userId: patientUid ?? "",
    therapistId: therapistUid ?? "",
    status: ConnectionStatus.PENDING,
    consentHash: consentHash ?? "",
    connectedAt: serverTimestamp(),
  };

  // We use setDoc here because a new request safely overwrites a PENDING or REVOKED state
  await setDoc(connectionRef, connectionData);
}

/**
 * Updates the connection status (e.g., Therapist accepts -> ACTIVE, or either party -> REVOKED)
 */
export async function updateConnectionStatus(
  userId: string,
  therapistId: string, // Kept in signature for potential future checks or audit logs
  status: ConnectionStatus
): Promise<void> {
  const connectionRef = doc(db, COLLECTION_NAME, userId);

  await updateDoc(connectionRef, {
    status: status ?? ConnectionStatus.REVOKED
  });
}
