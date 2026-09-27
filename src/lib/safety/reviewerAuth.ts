export interface SafetyReviewerClaims {
  admin?: unknown;
  safetyReviewer?: unknown;
}

export type SafetyReviewerRole = "SAFETY_REVIEWER" | "ADMIN";

export function safetyReviewerRoleFromClaims(claims: SafetyReviewerClaims): SafetyReviewerRole | null {
  if (claims.admin === true) return "ADMIN";
  if (claims.safetyReviewer === true) return "SAFETY_REVIEWER";
  return null;
}
