export type RelationshipAction = "ACCEPT" | "REJECT" | "REVOKE";

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
