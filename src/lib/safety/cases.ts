import { z } from "zod";
import {
  reviewUrgencySchema,
  safetyAssessmentStepSchema,
  safetyResolutionSchema,
  safetyStateSchema,
  safetyTargetSchema,
  safetyTriggerTypeSchema,
} from "./schemas.ts";

export const SAFETY_CASE_STATUSES = [
  "OPEN",
  "ACKNOWLEDGED",
  "HUMAN_CONNECTED",
  "EXTERNAL_HANDOFF",
  "RESOLVED",
] as const;
export const safetyCaseStatusSchema = z.enum(SAFETY_CASE_STATUSES);
export type SafetyCaseStatus = z.infer<typeof safetyCaseStatusSchema>;

export const SAFETY_ACTION_TYPES = [
  "CASE_CREATED",
  "CASE_UPDATED",
  "ACKNOWLEDGED",
  "ASSIGNED",
  "CONTACT_ATTEMPT",
  "CONTACT_FAILED",
  "CONTACT_SUCCEEDED",
  "HUMAN_CONNECTED",
  "EXTERNAL_HANDOFF_RECORDED",
  "NOTE_ADDED",
  "RESOLVED",
] as const;
export const safetyActionTypeSchema = z.enum(SAFETY_ACTION_TYPES);
export type SafetyActionType = z.infer<typeof safetyActionTypeSchema>;

export const externalPartyTypeSchema = z.enum([
  "TRUSTED_CONTACT",
  "CLINICIAN",
  "AMBULANCE",
  "POLICE",
  "OTHER",
]);
export type ExternalPartyType = z.infer<typeof externalPartyTypeSchema>;

export const safetyContactChannelSchema = z.enum(["PHONE", "SMS", "IN_PERSON", "OTHER"]);
export type SafetyContactChannel = z.infer<typeof safetyContactChannelSchema>;

export const safetyContactOutcomeSchema = z.enum([
  "FAILED",
  "NO_ANSWER",
  "UNREACHABLE",
  "SUCCEEDED",
]);
export type SafetyContactOutcome = z.infer<typeof safetyContactOutcomeSchema>;

export const safetyActionOutcomeSchema = z.enum([
  "FAILED",
  "NO_ANSWER",
  "UNREACHABLE",
  "SUCCEEDED",
  "NORMAL",
  "CLARIFY",
  "SELF_HARM",
  "SUICIDAL",
  "IMMINENT",
  "MEDICAL_EMERGENCY",
]);

export const reviewerActorRoleSchema = z.enum(["SAFETY_REVIEWER", "ADMIN", "SYSTEM"]);
export type ReviewerActorRole = z.infer<typeof reviewerActorRoleSchema>;

export const safetyActionSchema = z.object({
  id: z.string().min(1).max(128),
  type: safetyActionTypeSchema,
  actorUid: z.string().min(1).max(128),
  actorRole: reviewerActorRoleSchema,
  createdAt: z.string().datetime().nullable(),
  channel: safetyContactChannelSchema.optional(),
  outcome: safetyActionOutcomeSchema.optional(),
  note: z.string().max(1000).optional(),
  externalPartyType: externalPartyTypeSchema.optional(),
}).strict();
export type SafetyAction = z.infer<typeof safetyActionSchema>;

export const safetyCaseSchema = z.object({
  id: z.string().min(1).max(128),
  userId: z.string().min(1).max(128),
  sessionId: z.string().min(1).max(128),
  currentState: safetyStateSchema,
  status: safetyCaseStatusSchema,
  trigger: safetyTriggerTypeSchema,
  relevantUserText: z.string().min(1).max(4000),
  safetyTarget: safetyTargetSchema,
  reviewUrgency: reviewUrgencySchema.exclude(["NONE"]),
  assessmentStatus: safetyResolutionSchema,
  assessmentStep: safetyAssessmentStepSchema,
  source: z.enum(["TEXT", "VOICE"]),
  sourceEventId: z.string().min(1).max(128),
  latestSafetyEventId: z.string().min(1).max(128),
  policyVersion: z.string().min(1).max(80),
  createdAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime().nullable(),
  acknowledgedAt: z.string().datetime().nullable().optional(),
  acknowledgedByUid: z.string().min(1).max(128).optional(),
  assignedReviewerUid: z.string().min(1).max(128).optional(),
  resolvedAt: z.string().datetime().nullable().optional(),
  resolvedByUid: z.string().min(1).max(128).optional(),
  resolutionNote: z.string().max(1000).optional(),
  externalActionStatus: z.enum(["REQUESTED", "STARTED", "CONFIRMED", "FAILED"]).optional(),
  actions: z.array(safetyActionSchema).max(500),
}).strict();
export type SafetyCase = z.infer<typeof safetyCaseSchema>;

const ALLOWED_TRANSITIONS: Readonly<Record<SafetyCaseStatus, readonly SafetyCaseStatus[]>> = {
  OPEN: ["ACKNOWLEDGED"],
  ACKNOWLEDGED: ["HUMAN_CONNECTED", "EXTERNAL_HANDOFF"],
  HUMAN_CONNECTED: ["EXTERNAL_HANDOFF", "RESOLVED"],
  EXTERNAL_HANDOFF: ["RESOLVED"],
  RESOLVED: [],
};

export function canTransitionSafetyCase(from: SafetyCaseStatus, to: SafetyCaseStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertSafetyCaseTransition(from: SafetyCaseStatus, to: SafetyCaseStatus): void {
  if (!canTransitionSafetyCase(from, to)) {
    throw new Error(`Invalid safety case transition: ${from} -> ${to}`);
  }
}

export const REVIEW_URGENCY_RANK = Object.freeze({ NONE: 0, ROUTINE: 1, URGENT: 2, IMMEDIATE: 3 });

export function higherReviewUrgency<T extends keyof typeof REVIEW_URGENCY_RANK>(left: T, right: T): T {
  return REVIEW_URGENCY_RANK[right] > REVIEW_URGENCY_RANK[left] ? right : left;
}

export function sortSafetyCases<T extends Pick<SafetyCase, "status" | "reviewUrgency" | "createdAt">>(cases: T[]): T[] {
  return [...cases].sort((left, right) => {
    const leftResolved = left.status === "RESOLVED" ? 1 : 0;
    const rightResolved = right.status === "RESOLVED" ? 1 : 0;
    if (leftResolved !== rightResolved) return leftResolved - rightResolved;
    const urgencyDifference = REVIEW_URGENCY_RANK[right.reviewUrgency] - REVIEW_URGENCY_RANK[left.reviewUrgency];
    if (urgencyDifference) return urgencyDifference;
    return Date.parse(left.createdAt ?? "1970-01-01") - Date.parse(right.createdAt ?? "1970-01-01");
  });
}

export function sortSafetyActions<T extends Pick<SafetyAction, "id" | "createdAt">>(actions: T[]): T[] {
  return [...actions].sort((left, right) => {
    const timeDifference = Date.parse(left.createdAt ?? "1970-01-01") - Date.parse(right.createdAt ?? "1970-01-01");
    return timeDifference || left.id.localeCompare(right.id);
  });
}

/** Confirmed human connection is an explicit reviewer-recorded successful contact, never a view or attempt. */
export function statusConfirmsHumanConnection(status: SafetyCaseStatus): boolean {
  return status === "HUMAN_CONNECTED" || status === "EXTERNAL_HANDOFF" || status === "RESOLVED";
}

export type SafetyCasePersistenceDecision = "NONE" | "CREATE" | "UPDATE";

export function safetyCasePersistenceDecision(
  requiresHumanReview: boolean,
  activeStatus?: SafetyCaseStatus
): SafetyCasePersistenceDecision {
  if (!requiresHumanReview) return "NONE";
  if (activeStatus && activeStatus !== "RESOLVED") return "UPDATE";
  return "CREATE";
}

export type AssignmentDecision = "CLAIMED" | "ALREADY_OWNED" | "CONFLICT";

export function safetyCaseAssignmentDecision(
  assignedReviewerUid: string | undefined,
  requestingReviewerUid: string
): AssignmentDecision {
  if (!assignedReviewerUid) return "CLAIMED";
  return assignedReviewerUid === requestingReviewerUid ? "ALREADY_OWNED" : "CONFLICT";
}
