import { z } from "zod";

export const THERAPY_RELATIONSHIP_STATUSES = [
  "PENDING",
  "ACTIVE",
  "REJECTED",
  "REVOKED",
] as const;
export const therapyRelationshipStatusSchema = z.enum(THERAPY_RELATIONSHIP_STATUSES);
export type TherapyRelationshipStatus = z.infer<typeof therapyRelationshipStatusSchema>;

export const relationshipActionSchema = z.enum(["ACCEPT", "REJECT", "REVOKE"]);
export type RelationshipAction = z.infer<typeof relationshipActionSchema>;

export function canTransitionRelationship(input: {
  action: RelationshipAction;
  relationshipStatus: string;
  pointerStatus: string;
  isCurrentRelationship: boolean;
  actorIsPatient: boolean;
  actorIsTherapist: boolean;
  therapistIsVerified: boolean;
}): boolean {
  if (!input.isCurrentRelationship) return false;
  if (input.action === "ACCEPT" || input.action === "REJECT") {
    return input.actorIsTherapist &&
      input.therapistIsVerified &&
      input.relationshipStatus === "PENDING" &&
      input.pointerStatus === "PENDING";
  }
  return (input.actorIsPatient || input.actorIsTherapist) &&
    (input.relationshipStatus === "PENDING" || input.relationshipStatus === "ACTIVE");
}
