import { NextResponse, type NextRequest } from "next/server";
import { isFeatureEnabled } from "@/src/config/features";
import { verifyFirebaseBearerToken } from "@/src/server/auth";
import { getAdminDb } from "@/src/server/firebaseAdmin";
import { getSafetyCase, requireSafetyReviewer, SafetyCaseError } from "@/src/server/safety/cases";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    if (!isFeatureEnabled("SAFETY_DASHBOARD")) {
      return NextResponse.json({ error: "Safety dashboard is disabled." }, { status: 404 });
    }
    const token = await verifyFirebaseBearerToken(request);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    requireSafetyReviewer(token);
    const { caseId } = await params;
    if (!caseId || caseId.length > 128) {
      return NextResponse.json({ error: "Invalid safety case ID." }, { status: 400 });
    }
    return NextResponse.json({ case: await getSafetyCase(getAdminDb(), caseId) });
  } catch (error) {
    if (error instanceof SafetyCaseError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("SAFETY CASE DETAIL ERROR", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Could not load the safety case." }, { status: 500 });
  }
}
