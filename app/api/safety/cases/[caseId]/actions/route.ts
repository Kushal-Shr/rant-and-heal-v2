import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  externalPartyTypeSchema,
  safetyContactChannelSchema,
  safetyContactOutcomeSchema,
} from "@/src/lib/safety/cases";
import { isFeatureEnabled } from "@/src/config/features";
import { verifyFirebaseBearerToken } from "@/src/server/auth";
import { getAdminDb } from "@/src/server/firebaseAdmin";
import {
  acknowledgeSafetyCase,
  addSafetyCaseNote,
  assignSafetyCase,
  recordContactAttempt,
  recordContactOutcome,
  recordExternalHandoff,
  requireSafetyReviewer,
  resolveSafetyCase,
  SafetyCaseError,
} from "@/src/server/safety/cases";

export const runtime = "nodejs";

const base = z.object({ requestId: z.string().uuid() });
const note = z.string().trim().min(1).max(1000).optional();
const schema = z.discriminatedUnion("action", [
  base.extend({ action: z.literal("ACKNOWLEDGE") }).strict(),
  base.extend({ action: z.literal("ASSIGN_SELF") }).strict(),
  base.extend({
    action: z.literal("CONTACT_ATTEMPT"),
    externalPartyType: externalPartyTypeSchema,
    channel: safetyContactChannelSchema,
    note,
  }).strict(),
  base.extend({
    action: z.literal("CONTACT_OUTCOME"),
    externalPartyType: externalPartyTypeSchema,
    channel: safetyContactChannelSchema,
    outcome: safetyContactOutcomeSchema,
    note,
  }).strict(),
  base.extend({
    action: z.literal("EXTERNAL_HANDOFF"),
    externalPartyType: externalPartyTypeSchema,
    channel: safetyContactChannelSchema,
    note,
  }).strict(),
  base.extend({
    action: z.literal("RESOLVE"),
    resolutionNote: z.string().trim().min(1).max(1000),
  }).strict(),
  base.extend({
    action: z.literal("ADD_NOTE"),
    note: z.string().trim().min(1).max(1000),
  }).strict(),
]).superRefine((value, context) => {
  if (value.action === "CONTACT_OUTCOME" && value.outcome === "SUCCEEDED" && !value.note) {
    context.addIssue({ code: "custom", path: ["note"], message: "Successful contact requires a minimal confirmation note." });
  }
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    if (!isFeatureEnabled("SAFETY_DASHBOARD")) {
      return NextResponse.json({ error: "Safety dashboard is disabled." }, { status: 404 });
    }
    const token = await verifyFirebaseBearerToken(request);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const actor = requireSafetyReviewer(token);
    const { caseId } = await params;
    if (!caseId || caseId.length > 128) {
      return NextResponse.json({ error: "Invalid safety case ID." }, { status: 400 });
    }
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid safety case action." }, { status: 400 });
    }
    const common = { db: getAdminDb(), caseId, actor, requestId: parsed.data.requestId };
    let safetyCase;
    switch (parsed.data.action) {
      case "ACKNOWLEDGE":
        safetyCase = await acknowledgeSafetyCase(common);
        break;
      case "ASSIGN_SELF":
        safetyCase = await assignSafetyCase(common);
        break;
      case "CONTACT_ATTEMPT":
        safetyCase = await recordContactAttempt({ ...common, ...parsed.data });
        break;
      case "CONTACT_OUTCOME":
        safetyCase = await recordContactOutcome({ ...common, ...parsed.data });
        break;
      case "EXTERNAL_HANDOFF":
        safetyCase = await recordExternalHandoff({ ...common, ...parsed.data });
        break;
      case "RESOLVE":
        safetyCase = await resolveSafetyCase({ ...common, resolutionNote: parsed.data.resolutionNote });
        break;
      case "ADD_NOTE":
        safetyCase = await addSafetyCaseNote({ ...common, note: parsed.data.note });
        break;
    }
    return NextResponse.json({ case: safetyCase });
  } catch (error) {
    if (error instanceof SafetyCaseError) {
      console.warn("SAFETY CASE ACTION REJECTED", { status: error.status, reason: error.message });
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message.startsWith("Invalid safety case transition:")) {
      console.warn("SAFETY CASE TRANSITION REJECTED", { reason: error.message });
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("SAFETY CASE ACTION ERROR", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Safety case action failed." }, { status: 500 });
  }
}
