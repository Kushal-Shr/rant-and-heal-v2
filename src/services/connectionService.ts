import { collection, doc, getDoc, onSnapshot, query, where, type Unsubscribe } from "firebase/firestore";
import { auth, db } from "../config/firebase";
import type { Connection, SharedPatientProfile } from "../types/database";
import { ConnectionStatus } from "../types/database";
import { THERAPY_CONSENT_VERSION } from "../lib/therapy/consent";

type ConnectionAction =
  | { action: "REQUEST"; therapistId: string; consentAccepted: true; consentVersion: string }
  | { action: "ACCEPT" | "REJECT" | "REVOKE"; relationshipId: string }
  | { action: "CONSENT_AI"; relationshipId: string; consentAccepted: true; consentVersion: string };

const legacyMigrationsInFlight = new Set<string>();

export async function migrateLegacyConnection(patientId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || legacyMigrationsInFlight.has(patientId)) return;
  legacyMigrationsInFlight.add(patientId);
  try {
    const response = await fetch("/api/therapy/connections/migrate", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await user.getIdToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ patientId }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? "Could not migrate the existing therapist connection.");
    }
  } finally {
    legacyMigrationsInFlight.delete(patientId);
  }
}

async function mutateConnection(action: ConnectionAction): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in to update a connection.");
  const response = await fetch("/api/therapy/connections", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(action),
  });
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error ?? "Could not update this connection.");
}

export function requestConnection(therapistId: string) {
  return mutateConnection({
    action: "REQUEST",
    therapistId,
    consentAccepted: true,
    consentVersion: THERAPY_CONSENT_VERSION,
  });
}

export function acceptTherapyAiConsent(relationshipId: string) {
  return mutateConnection({ action: "CONSENT_AI", relationshipId, consentAccepted: true, consentVersion: THERAPY_CONSENT_VERSION });
}

export function revokeConnection(relationshipId: string) {
  return mutateConnection({ action: "REVOKE", relationshipId });
}

export function acceptConnection(relationshipId: string) {
  return mutateConnection({ action: "ACCEPT", relationshipId });
}

export function rejectConnection(relationshipId: string) {
  return mutateConnection({ action: "REJECT", relationshipId });
}

export function observePatientConnection(
  patientId: string,
  onChange: (connection: Connection | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, "connections", patientId),
    (snapshot) => {
      if (!snapshot.exists()) {
        onChange(null);
        return;
      }
      const connection = { id: snapshot.id, ...snapshot.data() } as Connection;
      onChange(connection);
      if (!connection.relationshipId) {
        void migrateLegacyConnection(patientId).catch((error: unknown) => {
          console.error("Unable to migrate legacy therapist connection", error);
        });
      }
    },
    onError
  );
}

function observeTherapistConnections(
  therapistId: string,
  status: ConnectionStatus,
  onChange: (connections: Connection[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const connectionQuery = query(
    collection(db, "therapy_relationships"),
    where("therapistId", "==", therapistId),
    where("status", "==", status)
  );
  return onSnapshot(
    connectionQuery,
    (snapshot) => onChange(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Connection))),
    onError
  );
}

export function observePendingConnections(
  therapistId: string,
  onChange: (connections: Connection[]) => void,
  onError?: (error: Error) => void
) {
  return observeTherapistConnections(therapistId, ConnectionStatus.PENDING, onChange, onError);
}

export function observeActiveConnections(
  therapistId: string,
  onChange: (connections: Connection[]) => void,
  onError?: (error: Error) => void
) {
  return observeTherapistConnections(therapistId, ConnectionStatus.ACTIVE, onChange, onError);
}

export async function getSharedPatientProfile(patientId: string): Promise<SharedPatientProfile | null> {
  const snapshot = await getDoc(doc(db, "patient_profiles", patientId));
  return snapshot.exists() ? (snapshot.data() as SharedPatientProfile) : null;
}
