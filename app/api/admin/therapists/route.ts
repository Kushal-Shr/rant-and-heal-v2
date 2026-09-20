import { NextResponse, type NextRequest } from "next/server";
import { verifyFirebaseBearerToken } from "@/src/server/auth";
import { getAdminDb } from "@/src/server/firebaseAdmin";
import { TherapistVerificationStatus } from "@/src/types/database";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = await verifyFirebaseBearerToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (token.admin !== true) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const snapshot = await getAdminDb()
    .collection("therapists")
    .where("verificationStatus", "==", TherapistVerificationStatus.PENDING)
    .limit(50)
    .get();
  return NextResponse.json({
    therapists: snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
  });
}
