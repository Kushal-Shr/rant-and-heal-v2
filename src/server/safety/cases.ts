import { createHash } from "node:crypto";
import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import type { DecodedIdToken } from "firebase-admin/auth";
import {
  assertSafetyCaseTransition,
  higherReviewUrgency,
  safetyCaseAssignmentDecision,
  safetyCasePersistenceDecision,
  sortSafetyActions,
  type ExternalPartyType,
  type ReviewerActorRole,
  type SafetyAction,
  type SafetyActionType,
  type SafetyCase,
  type SafetyCaseStatus,
  type SafetyContactChannel,
  type SafetyContactOutcome,
} from "@/src/lib/safety/cases";
import type { SafetyEvaluation } from "@/src/lib/safety/schemas";
import { safetyReviewerRole } from "@/src/server/auth";
import { SAFETY_POLICY_VERSION } from "@/src/server/safety/classifier";

const CASES = "safety_cases";
const EPISODES = "safety_case_episodes";
const RESOLVED = "RESOLVED" satisfies SafetyCaseStatus;

export class SafetyCaseError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "SafetyCaseError";
  }
}

export interface ReviewerActor {
  uid: string;
  role: Exclude<ReviewerActorRole, "SYSTEM">;
}

export function requireSafetyReviewer(token: DecodedIdToken): ReviewerActor {
  const role = safetyReviewerRole(token);
  if (!role) {
    console.warn("SAFETY CASE AUTHORIZATION DENIED", { uid: token.uid });
    throw new SafetyCaseError("Safety reviewer access is required.", 403);
  }
  return { uid: token.uid, role };
}

function episodeId(userId: string, sessionId: string): string {
  return createHash("sha256").update(`${userId}\0${sessionId}`).digest("hex");
}

function iso(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

function optionalString(data: DocumentData, key: string): string | undefined {
  return typeof data[key] === "string" ? data[key] : undefined;
}

function serializeAction(id: string, data: DocumentData): SafetyAction {
  return {
    id,
    type: data.type as SafetyActionType,
    actorUid: String(data.actorUid),
    actorRole: data.actorRole as ReviewerActorRole,
    createdAt: iso(data.createdAt),
    ...(optionalString(data, "channel") ? { channel: data.channel as SafetyContactChannel } : {}),
    ...(optionalString(data, "outcome") ? { outcome: data.outcome as SafetyContactOutcome } : {}),
    ...(optionalString(data, "note") ? { note: data.note as string } : {}),
    ...(optionalString(data, "externalPartyType") ? { externalPartyType: data.externalPartyType as ExternalPartyType } : {}),
  };
}

function serializeCase(id: string, data: DocumentData, actions: SafetyAction[]): SafetyCase {
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
    ...(optionalString(data, "acknowledgedByUid") ? { acknowledgedByUid: data.acknowledgedByUid as string } : {}),
    ...(optionalString(data, "assignedReviewerUid") ? { assignedReviewerUid: data.assignedReviewerUid as string } : {}),
    ...(iso(data.resolvedAt) ? { resolvedAt: iso(data.resolvedAt) } : {}),
    ...(optionalString(data, "resolvedByUid") ? { resolvedByUid: data.resolvedByUid as string } : {}),
    ...(optionalString(data, "resolutionNote") ? { resolutionNote: data.resolutionNote as string } : {}),
    ...(optionalString(data, "externalActionStatus") ? { externalActionStatus: data.externalActionStatus } : {}),
    actions,
  } as SafetyCase;
}

export async function listSafetyCases(db: Firestore): Promise<SafetyCase[]> {
  const snapshot = await db.collection(CASES).orderBy("createdAt", "desc").limit(100).get();
  return snapshot.docs.map((item) => serializeCase(item.id, item.data(), []));
}

export async function getSafetyCase(db: Firestore, caseId: string): Promise<SafetyCase> {
  const caseRef = db.collection(CASES).doc(caseId);
  const [caseSnapshot, actionsSnapshot] = await Promise.all([
    caseRef.get(),
    // Keep the audit read index-independent. The bounded result is sorted after
    // serialization so a committed mutation cannot fail only while reloading
    // its timeline.
    caseRef.collection("actions").limit(500).get(),
  ]);
  if (!caseSnapshot.exists) throw new SafetyCaseError("Safety case not found.", 404);
  return serializeCase(
    caseSnapshot.id,
    caseSnapshot.data()!,
    sortSafetyActions(actionsSnapshot.docs.map((item) => serializeAction(item.id, item.data())))
  );
}

async function getCommittedSafetyCase(db: Firestore, caseId: string): Promise<SafetyCase> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await getSafetyCase(db, caseId);
    } catch (error) {
      if (error instanceof SafetyCaseError) throw error;
      lastError = error;
      console.warn("SAFETY CASE POST-COMMIT READ RETRY", {
        caseId,
        attempt,
        code: typeof error === "object" && error !== null && "code" in error
          ? String(error.code)
          : "UNKNOWN",
      });
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 50));
      }
    }
  }
  throw lastError;
}

interface CaseFromSafetyEventOptions {
  db: Firestore;
  transaction: Transaction;
  eventId: string;
  userId: string;
  sessionId: string;
  userText: string;
  source: "TEXT" | "VOICE";
  evaluation: SafetyEvaluation;
}

/**
 * A Momo session is the bounded technical safety episode. Unresolved cases are
 * reused within it; a new review-required event after resolution creates a new
 * case. Cross-session episode/reopening policy remains CLINICIAN_REVIEW_REQUIRED.
 */
export async function createOrUpdateSafetyCaseInTransaction({
  db,
  transaction,
  eventId,
  userId,
  sessionId,
  userText,
  source,
  evaluation,
}: CaseFromSafetyEventOptions): Promise<string | null> {
  if (safetyCasePersistenceDecision(evaluation.requiresHumanReview) === "NONE") return null;

  const pointerRef = db.collection(EPISODES).doc(episodeId(userId, sessionId));
  const pointerSnapshot = await transaction.get(pointerRef);
  const activeCaseId = optionalString(pointerSnapshot.data() ?? {}, "activeCaseId");
  const existingRef = activeCaseId ? db.collection(CASES).doc(activeCaseId) : null;
  const existingSnapshot = existingRef ? await transaction.get(existingRef) : null;
  const existing = existingSnapshot?.exists ? existingSnapshot.data()! : null;

  if (existingRef && existing && safetyCasePersistenceDecision(true, existing.status) === "UPDATE") {
    const actionRef = existingRef.collection("actions").doc(`event-${eventId}`);
    transaction.update(existingRef, {
      currentState: evaluation.state,
      trigger: evaluation.triggerType,
      safetyTarget: evaluation.safetyTarget,
      reviewUrgency: higherReviewUrgency(existing.reviewUrgency, evaluation.reviewUrgency),
      assessmentStatus: evaluation.resolution,
      assessmentStep: evaluation.assessmentStep,
      latestSafetyEventId: eventId,
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(actionRef, {
      type: "CASE_UPDATED",
      actorUid: "SYSTEM",
      actorRole: "SYSTEM",
      outcome: evaluation.state,
      createdAt: FieldValue.serverTimestamp(),
    });
    return existingRef.id;
  }

  const caseRef = db.collection(CASES).doc();
  transaction.create(caseRef, {
    userId,
    sessionId,
    currentState: evaluation.state,
    status: "OPEN",
    trigger: evaluation.triggerType,
    relevantUserText: userText,
    safetyTarget: evaluation.safetyTarget,
    reviewUrgency: evaluation.reviewUrgency,
    assessmentStatus: evaluation.resolution,
    assessmentStep: evaluation.assessmentStep,
    source,
    sourceEventId: eventId,
    latestSafetyEventId: eventId,
    policyVersion: SAFETY_POLICY_VERSION,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  transaction.create(caseRef.collection("actions").doc(`event-${eventId}`), {
    type: "CASE_CREATED",
    actorUid: "SYSTEM",
    actorRole: "SYSTEM",
    outcome: evaluation.state,
    createdAt: FieldValue.serverTimestamp(),
  });
  transaction.set(pointerRef, {
    userId,
    sessionId,
    activeCaseId: caseRef.id,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return caseRef.id;
}

interface MutationBase {
  db: Firestore;
  caseId: string;
  actor: ReviewerActor;
  requestId: string;
}

interface ActionFields {
  type: SafetyActionType;
  channel?: SafetyContactChannel;
  outcome?: SafetyAction["outcome"];
  note?: string;
  externalPartyType?: ExternalPartyType;
}

async function runMutation(
  options: MutationBase,
  expectedAction: SafetyActionType,
  operation: (context: {
    transaction: Transaction;
    caseRef: FirebaseFirestore.DocumentReference;
    data: DocumentData;
    writeAction: (suffix: string, fields: ActionFields) => void;
  }) => void
): Promise<SafetyCase> {
  const { db, caseId, actor, requestId } = options;
  const caseRef = db.collection(CASES).doc(caseId);
  await db.runTransaction(async (transaction) => {
    const caseSnapshot = await transaction.get(caseRef);
    const idempotencyRef = caseRef.collection("actions").doc(requestId);
    const idempotencySnapshot = await transaction.get(idempotencyRef);
    if (!caseSnapshot.exists) throw new SafetyCaseError("Safety case not found.", 404);
    if (idempotencySnapshot.exists) {
      if (idempotencySnapshot.data()?.type !== expectedAction) {
        throw new SafetyCaseError("Idempotency key was already used for a different action.", 409);
      }
      return;
    }
    const data = caseSnapshot.data()!;
    const writeAction = (suffix: string, fields: ActionFields) => {
      const actionRef = suffix ? caseRef.collection("actions").doc(`${requestId}-${suffix}`) : idempotencyRef;
      transaction.create(actionRef, {
        ...fields,
        actorUid: actor.uid,
        actorRole: actor.role,
        createdAt: FieldValue.serverTimestamp(),
      });
    };
    operation({ transaction, caseRef, data, writeAction });
  });
  console.info("SAFETY CASE ACTION COMMITTED", {
    caseId,
    actorUid: actor.uid,
    action: expectedAction,
  });
  // The transaction is already committed at this point. Retry only this
  // read-only hydration step so a transient Firestore stream error cannot turn
  // a successful action into a misleading HTTP 500 response.
  return getCommittedSafetyCase(db, caseId);
}

function assertActive(data: DocumentData): void {
  if (data.status === RESOLVED) throw new SafetyCaseError("This safety case is already resolved.", 409);
}

export function acknowledgeSafetyCase(options: MutationBase): Promise<SafetyCase> {
  return runMutation(options, "ACKNOWLEDGED", ({ transaction, caseRef, data, writeAction }) => {
    assertSafetyCaseTransition(data.status, "ACKNOWLEDGED");
    transaction.update(caseRef, {
      status: "ACKNOWLEDGED",
      acknowledgedAt: FieldValue.serverTimestamp(),
      acknowledgedByUid: options.actor.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    writeAction("", { type: "ACKNOWLEDGED" });
  });
}

export function assignSafetyCase(options: MutationBase): Promise<SafetyCase> {
  return runMutation(options, "ASSIGNED", ({ transaction, caseRef, data, writeAction }) => {
    assertActive(data);
    const assignment = safetyCaseAssignmentDecision(data.assignedReviewerUid, options.actor.uid);
    if (assignment === "CONFLICT") {
      throw new SafetyCaseError("This case is already assigned to another reviewer.", 409);
    }
    transaction.update(caseRef, {
      assignedReviewerUid: options.actor.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    writeAction("", { type: "ASSIGNED" });
  });
}

export function recordContactAttempt(options: MutationBase & {
  externalPartyType: ExternalPartyType;
  channel: SafetyContactChannel;
  note?: string;
}): Promise<SafetyCase> {
  return runMutation(options, "CONTACT_ATTEMPT", ({ transaction, caseRef, writeAction, data }) => {
    assertActive(data);
    transaction.update(caseRef, {
      externalActionStatus: "STARTED",
      updatedAt: FieldValue.serverTimestamp(),
    });
    writeAction("", {
      type: "CONTACT_ATTEMPT",
      externalPartyType: options.externalPartyType,
      channel: options.channel,
      note: options.note,
    });
  });
}

export function recordContactOutcome(options: MutationBase & {
  externalPartyType: ExternalPartyType;
  channel: SafetyContactChannel;
  outcome: SafetyContactOutcome;
  note?: string;
}): Promise<SafetyCase> {
  if (options.outcome === "SUCCEEDED" && !options.note?.trim()) {
    throw new SafetyCaseError("Successful contact requires a minimal confirmation note.", 400);
  }
  const expectedAction = options.outcome === "SUCCEEDED" ? "CONTACT_SUCCEEDED" : "CONTACT_FAILED";
  return runMutation(options, expectedAction, ({ transaction, caseRef, data, writeAction }) => {
    assertActive(data);
    if (options.outcome !== "SUCCEEDED") {
      transaction.update(caseRef, {
        externalActionStatus: "FAILED",
        updatedAt: FieldValue.serverTimestamp(),
      });
      writeAction("", {
        type: "CONTACT_FAILED",
        externalPartyType: options.externalPartyType,
        channel: options.channel,
        outcome: options.outcome,
        note: options.note,
      });
      return;
    }
    assertSafetyCaseTransition(data.status, "HUMAN_CONNECTED");
    transaction.update(caseRef, {
      status: "HUMAN_CONNECTED",
      externalActionStatus: "CONFIRMED",
      updatedAt: FieldValue.serverTimestamp(),
    });
    writeAction("", {
      type: "CONTACT_SUCCEEDED",
      externalPartyType: options.externalPartyType,
      channel: options.channel,
      outcome: options.outcome,
      note: options.note,
    });
    writeAction("connected", {
      type: "HUMAN_CONNECTED",
      externalPartyType: options.externalPartyType,
      channel: options.channel,
      outcome: options.outcome,
    });
  });
}

export function recordExternalHandoff(options: MutationBase & {
  externalPartyType: ExternalPartyType;
  channel: SafetyContactChannel;
  note?: string;
}): Promise<SafetyCase> {
  return runMutation(options, "EXTERNAL_HANDOFF_RECORDED", ({ transaction, caseRef, data, writeAction }) => {
    assertSafetyCaseTransition(data.status, "EXTERNAL_HANDOFF");
    transaction.update(caseRef, {
      status: "EXTERNAL_HANDOFF",
      externalActionStatus: "CONFIRMED",
      updatedAt: FieldValue.serverTimestamp(),
    });
    writeAction("", {
      type: "EXTERNAL_HANDOFF_RECORDED",
      externalPartyType: options.externalPartyType,
      channel: options.channel,
      outcome: "SUCCEEDED",
      note: options.note,
    });
  });
}

export function addSafetyCaseNote(options: MutationBase & { note: string }): Promise<SafetyCase> {
  return runMutation(options, "NOTE_ADDED", ({ transaction, caseRef, data, writeAction }) => {
    assertActive(data);
    transaction.update(caseRef, { updatedAt: FieldValue.serverTimestamp() });
    writeAction("", { type: "NOTE_ADDED", note: options.note });
  });
}

export function resolveSafetyCase(options: MutationBase & { resolutionNote: string }): Promise<SafetyCase> {
  if (!options.resolutionNote.trim()) {
    throw new SafetyCaseError("Resolution requires a concise note.", 400);
  }
  return runMutation(options, "RESOLVED", ({ transaction, caseRef, data, writeAction }) => {
    assertSafetyCaseTransition(data.status, "RESOLVED");
    transaction.update(caseRef, {
      status: "RESOLVED",
      resolvedAt: FieldValue.serverTimestamp(),
      resolvedByUid: options.actor.uid,
      resolutionNote: options.resolutionNote,
      updatedAt: FieldValue.serverTimestamp(),
    });
    writeAction("", { type: "RESOLVED", note: options.resolutionNote });
  });
}
