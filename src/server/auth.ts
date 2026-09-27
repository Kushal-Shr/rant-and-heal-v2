import type { DecodedIdToken } from "firebase-admin/auth";
import type { NextRequest } from "next/server";
import { safetyReviewerRoleFromClaims, type SafetyReviewerRole } from "@/src/lib/safety/reviewerAuth";
import { getAdminAuth } from "./firebaseAdmin";

export type SafetyReviewerActorRole = SafetyReviewerRole;

export function extractBearerToken(request: NextRequest): string | null {
  const authorizationHeader = request.headers.get("authorization");

  if (!authorizationHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authorizationHeader.slice("Bearer ".length).trim();
}

export async function verifyFirebaseBearerToken(request: NextRequest): Promise<DecodedIdToken | null> {
  const token = extractBearerToken(request);

  if (!token) {
    return null;
  }

  try {
    return await getAdminAuth().verifyIdToken(token);
  } catch {
    return null;
  }
}

export function safetyReviewerRole(token: DecodedIdToken): SafetyReviewerActorRole | null {
  return safetyReviewerRoleFromClaims({
    admin: token.admin,
    safetyReviewer: token.safetyReviewer,
  });
}
