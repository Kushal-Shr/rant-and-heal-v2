import { NextResponse, type NextRequest } from "next/server";
import { isFeatureEnabled } from "@/src/config/features";
import { verifyFirebaseBearerToken } from "@/src/server/auth";
import { getAdminDb } from "@/src/server/firebaseAdmin";
import { listSafetyCases, requireSafetyReviewer, SafetyCaseError } from "@/src/server/safety/cases";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    if (!isFeatureEnabled("SAFETY_DASHBOARD")) {
      return NextResponse.json({ error: "Safety dashboard is disabled." }, { status: 404 });
    }
    const token = await verifyFirebaseBearerToken(request);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    requireSafetyReviewer(token);
    return NextResponse.json({ cases: await listSafetyCases(getAdminDb()) });
  } catch (error) {
    if (error instanceof SafetyCaseError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("SAFETY CASE LIST ERROR", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Could not load safety cases." }, { status: 500 });
  }
}
