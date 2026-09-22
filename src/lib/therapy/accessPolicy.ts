export function canAccessRelationship(input: {
  actorUid: string;
  patientUid: string;
  therapistUid: string;
  relationshipId: string;
  status: string;
  pointerRelationshipId?: string;
  pointerStatus?: string;
  role: "patient" | "therapist" | "either";
}): boolean {
  if (input.status !== "ACTIVE" || input.pointerStatus !== "ACTIVE" || input.pointerRelationshipId !== input.relationshipId) return false;
  if (input.role === "patient") return input.actorUid === input.patientUid;
  if (input.role === "therapist") return input.actorUid === input.therapistUid;
  return input.actorUid === input.patientUid || input.actorUid === input.therapistUid;
}
