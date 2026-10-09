import { NextResponse } from "next/server";

/** @deprecated GPT-Live uses authenticated SDP exchange at /api/momo/live-session. */
export async function POST() {
  return NextResponse.json({
    error: "This legacy Gemini voice endpoint has been retired. Use /api/momo/live-session.",
    code: "LEGACY_VOICE_ENDPOINT_RETIRED",
  }, { status: 410 });
}
