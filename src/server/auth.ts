import type { DecodedIdToken } from "firebase-admin/auth";
import type { NextRequest } from "next/server";
import { getAdminAuth } from "./firebaseAdmin";

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

  return getAdminAuth().verifyIdToken(token);
}
