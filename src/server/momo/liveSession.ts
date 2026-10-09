import { createHmac } from "node:crypto";
import { z } from "zod";
import {
  AI_MODEL_CONFIGS,
  EXPECTED_MOMO_VOICE_MODEL,
  type ModelConfig,
} from "@/src/lib/ai/models";
import { parseConversationContinuityState } from "@/src/lib/momo/continuity";
import { planMomoResponse } from "@/src/lib/momo/planner";
import { buildMomoVoiceInstructions } from "@/src/lib/momo/live/policy";
import type {
  ConversationContinuityState,
  ConversationParticipant,
  ConversationTurn,
  MomoDecision,
} from "@/src/lib/momo/schemas";
import { safetyEvaluationSchema, type SafetyEvaluation } from "@/src/lib/safety/schemas";
import { MOMO_SYSTEM_INSTRUCTION } from "@/src/server/momo/persona";

export const OPENAI_LIVE_SESSION_ENDPOINT = "https://api.openai.com/v1/live/sessions";
const HISTORY_LIMIT = 12;

// SDP is a line-oriented wire format. Validate it without normalizing it: in
// particular, trimming here removes the final CRLF from the browser's offer
// and can make OpenAI reject the offer as truncated.
export const momoLiveOfferSchema = z.string()
  .min(1)
  .max(64_000)
  .refine((value) => value.trim().length > 0, {
    message: "SDP offer cannot be blank.",
  });

export interface MomoLiveBootstrap {
  userId: string;
  sessionId: string;
  history: ConversationTurn[];
  continuityState: ConversationContinuityState;
  safetyEvaluation?: SafetyEvaluation;
  participant?: ConversationParticipant;
}

export interface MomoLiveSessionResult {
  session: { id: string };
  transport: { type: "webrtc"; sdp: string };
}

const liveSessionResultSchema = z.object({
  session: z.object({ id: z.string().min(1).max(256) }).passthrough(),
  transport: z.object({
    type: z.literal("webrtc"),
    sdp: z.string().min(1),
  }).passthrough(),
}).passthrough();

export function assertMomoVoiceModel(config: ModelConfig): void {
  if (config.provider !== "openai" || config.model !== EXPECTED_MOMO_VOICE_MODEL) {
    throw new Error(
      `Momo voice must use openai/${EXPECTED_MOMO_VOICE_MODEL}; received ${config.provider}/${config.model}.`
    );
  }
}

if (process.env.NODE_ENV !== "production") {
  assertMomoVoiceModel(AI_MODEL_CONFIGS.MOMO_VOICE);
  console.info("MOMO VOICE MODEL:", AI_MODEL_CONFIGS.MOMO_VOICE);
}

export function stableSafetyIdentifier(userId: string, secret: string): string {
  if (!secret.trim()) throw new Error("MOMO_SAFETY_IDENTIFIER_SECRET is required for Momo voice.");
  return createHmac("sha256", secret).update(userId).digest("hex");
}

function startupDecision(bootstrap: MomoLiveBootstrap): MomoDecision {
  const latestUserText = [...bootstrap.history].reverse().find((turn) => turn.role === "USER")?.text
    ?? "Continue this conversation without assuming what kind of support is wanted.";
  return planMomoResponse({
    messageText: latestUserText,
    history: bootstrap.history.slice(-HISTORY_LIMIT),
    continuityState: bootstrap.continuityState,
    participant: bootstrap.participant,
    previousSafetyEvaluation: bootstrap.safetyEvaluation,
  }, bootstrap.safetyEvaluation?.state ?? "NORMAL");
}

export function buildMomoLiveSessionRequest(offerSdp: string, bootstrap: MomoLiveBootstrap) {
  const decision = startupDecision(bootstrap);
  const latestUserText = [...bootstrap.history].reverse().find((turn) => turn.role === "USER")?.text;
  const voicePolicy = buildMomoVoiceInstructions(MOMO_SYSTEM_INSTRUCTION, decision, {
    continuityState: bootstrap.continuityState,
    participant: bootstrap.participant,
    recentUserText: latestUserText,
  });
  const input = bootstrap.history.slice(-HISTORY_LIMIT).map((turn) => ({
    type: "message" as const,
    role: turn.role === "MOMO" ? "assistant" as const : "user" as const,
    status: "completed" as const,
    content: [{
      type: turn.role === "MOMO" ? "output_text" as const : "input_text" as const,
      text: turn.text,
    }],
  }));

  return {
    policy: voicePolicy,
    body: {
      session: {
        model: AI_MODEL_CONFIGS.MOMO_VOICE.model,
        instructions: voicePolicy.instructions,
        input,
        store: false,
        audio: { output: { voice: process.env.MOMO_VOICE_NAME ?? "marin" } },
        delegation: { type: "client" },
        client: {
          data_channel: {
            allowed_client_events: [
              "session.close",
              "session.input_audio.mute",
              "session.input_audio.unmute",
            ],
            allowed_server_events: [
              { type: "session.started" },
              { type: "session.closed" },
              { type: "session.input_audio.muted" },
              { type: "session.input_audio.unmuted" },
              { type: "session.input_transcript.delta" },
              { type: "session.output_transcript.delta" },
              { type: "session.usage.updated" },
              { type: "info" },
              { type: "error" },
            ],
          },
        },
      },
      transport: { type: "webrtc" as const, sdp: offerSdp },
    },
  };
}

export async function createMomoLiveSession(options: {
  apiKey: string;
  safetyIdentifier: string;
  offerSdp: string;
  bootstrap: MomoLiveBootstrap;
}): Promise<MomoLiveSessionResult> {
  assertMomoVoiceModel(AI_MODEL_CONFIGS.MOMO_VOICE);
  const request = buildMomoLiveSessionRequest(options.offerSdp, options.bootstrap);
  const response = await fetch(OPENAI_LIVE_SESSION_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier": options.safetyIdentifier,
    },
    body: JSON.stringify(request.body),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const providerMessage = payload && typeof payload === "object" && "error" in payload
      ? JSON.stringify((payload as { error: unknown }).error)
      : `HTTP ${response.status}`;
    throw new Error(`OpenAI Live session creation failed: ${providerMessage}`);
  }
  return liveSessionResultSchema.parse(payload);
}

export function parseLiveBootstrapState(raw: {
  history: ConversationTurn[];
  continuityState: unknown;
  safetyEvaluation: unknown;
  userId: string;
  sessionId: string;
  participant?: ConversationParticipant;
}): MomoLiveBootstrap {
  return {
    userId: raw.userId,
    sessionId: raw.sessionId,
    history: raw.history.slice(-HISTORY_LIMIT),
    continuityState: parseConversationContinuityState(raw.continuityState),
    safetyEvaluation: safetyEvaluationSchema.safeParse(raw.safetyEvaluation).data,
    participant: raw.participant,
  };
}
