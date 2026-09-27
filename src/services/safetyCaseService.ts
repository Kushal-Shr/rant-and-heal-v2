import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/src/config/firebase";
import { sortSafetyActions, type SafetyAction, type SafetyCase } from "@/src/lib/safety/cases";

function iso(value: unknown): string | null {
  const candidate = value as Partial<Timestamp> | null;
  return typeof candidate?.toDate === "function" ? candidate.toDate().toISOString() : null;
}

function actionFromData(id: string, data: DocumentData): SafetyAction {
  return {
    id,
    type: data.type,
    actorUid: String(data.actorUid),
    actorRole: data.actorRole,
    createdAt: iso(data.createdAt),
    ...(data.channel ? { channel: data.channel } : {}),
    ...(data.outcome ? { outcome: data.outcome } : {}),
    ...(data.note ? { note: data.note } : {}),
    ...(data.externalPartyType ? { externalPartyType: data.externalPartyType } : {}),
  };
}

function caseFromData(id: string, data: DocumentData, actions: SafetyAction[] = []): SafetyCase {
  return {
    id,
    userId: String(data.userId),
    sessionId: String(data.sessionId),
    currentState: data.currentState,
    status: data.status,
    trigger: data.trigger,
    relevantUserText: String(data.relevantUserText),
    safetyTarget: data.safetyTarget,
    reviewUrgency: data.reviewUrgency,
    assessmentStatus: data.assessmentStatus,
    assessmentStep: data.assessmentStep,
    source: data.source,
    sourceEventId: String(data.sourceEventId),
    latestSafetyEventId: String(data.latestSafetyEventId),
    policyVersion: String(data.policyVersion),
    createdAt: iso(data.createdAt),
    updatedAt: iso(data.updatedAt),
    ...(iso(data.acknowledgedAt) ? { acknowledgedAt: iso(data.acknowledgedAt) } : {}),
    ...(data.acknowledgedByUid ? { acknowledgedByUid: String(data.acknowledgedByUid) } : {}),
    ...(data.assignedReviewerUid ? { assignedReviewerUid: String(data.assignedReviewerUid) } : {}),
    ...(iso(data.resolvedAt) ? { resolvedAt: iso(data.resolvedAt) } : {}),
    ...(data.resolvedByUid ? { resolvedByUid: String(data.resolvedByUid) } : {}),
    ...(data.resolutionNote ? { resolutionNote: String(data.resolutionNote) } : {}),
    ...(data.externalActionStatus ? { externalActionStatus: data.externalActionStatus } : {}),
    actions,
  };
}

export function observeSafetyCases(
  onChange: (cases: SafetyCase[]) => void,
  onError: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, "safety_cases"), orderBy("createdAt", "desc"), limit(100)),
    (snapshot) => onChange(snapshot.docs.map((item) => caseFromData(item.id, item.data()))),
    onError
  );
}

export function observeSafetyCase(
  caseId: string,
  onChange: (safetyCase: SafetyCase | null) => void,
  onError: (error: Error) => void
): Unsubscribe {
  let currentCase: SafetyCase | null = null;
  let currentActions: SafetyAction[] = [];
  const emit = () => onChange(currentCase ? { ...currentCase, actions: currentActions } : null);
  const unsubscribeCase = onSnapshot(doc(db, "safety_cases", caseId), (snapshot) => {
    currentCase = snapshot.exists() ? caseFromData(snapshot.id, snapshot.data()) : null;
    emit();
  }, onError);
  const unsubscribeActions = onSnapshot(
    query(collection(db, "safety_cases", caseId, "actions"), limit(500)),
    (snapshot) => {
      currentActions = sortSafetyActions(snapshot.docs.map((item) => actionFromData(item.id, item.data())));
      emit();
    },
    onError
  );
  return () => { unsubscribeCase(); unsubscribeActions(); };
}

export async function loadSafetyCases(token: string): Promise<SafetyCase[]> {
  const response = await fetch("/api/safety/cases", { headers: { Authorization: `Bearer ${token}` } });
  const payload = await response.json() as { cases?: SafetyCase[]; error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Could not load safety cases.");
  return payload.cases ?? [];
}

export async function loadSafetyCase(token: string, caseId: string): Promise<SafetyCase> {
  const response = await fetch(`/api/safety/cases/${encodeURIComponent(caseId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json() as { case?: SafetyCase; error?: string };
  if (!response.ok || !payload.case) throw new Error(payload.error ?? "Could not load the safety case.");
  return payload.case;
}

export async function mutateSafetyCase(
  token: string,
  caseId: string,
  body: Record<string, unknown>
): Promise<SafetyCase> {
  const response = await fetch(`/api/safety/cases/${encodeURIComponent(caseId)}/actions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as { case?: SafetyCase; error?: string };
  if (!response.ok || !payload.case) throw new Error(payload.error ?? "Safety case action failed.");
  return payload.case;
}
