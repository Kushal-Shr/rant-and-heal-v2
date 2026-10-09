import WebSocket from "ws";
import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { finalizeContinuityState, prepareContinuityState } from "@/src/lib/momo/continuity";
import { orchestrateMomoTurn } from "@/src/lib/momo/orchestrator";
import type { ConversationTurn, NormalizedConversationInput } from "@/src/lib/momo/schemas";
import { safetyResponseFor } from "@/src/lib/safety/responses";
import { shouldAttemptSafetySupportNotification } from "@/src/lib/safety/policy";
import { enforceBackendActionTruthfulness } from "@/src/lib/safety/actionTruthfulness";
import type { SafetyEvaluation } from "@/src/lib/safety/schemas";
import { getAdminDb } from "@/src/server/firebaseAdmin";
import { assessMomoTurnSafety } from "@/src/server/momo/turnSafety";
import { planMomoResponseWithInference } from "@/src/server/momo/planner";
import { generateMomoResponse } from "@/src/server/momo/responder";
import { recordMomoSafetyEvent } from "@/src/server/momo/safety";
import {
  notifySafetySupport,
  safetySupportNotificationsEnabled,
} from "@/src/server/safety/notifications";
import type { MomoLiveBootstrap } from "@/src/server/momo/liveSession";

const SIDEBAND_OPEN_TIMEOUT_MS = 5_000;
const TRANSCRIPT_SETTLE_MS = 180;
const HEARTBEAT_MS = 5_000;
const MAX_TRANSCRIPT_CHARS = 8_000;

interface LiveEvent {
  type?: string;
  delta?: string;
  end_ms?: number;
  delegation?: { id?: string; target?: string };
  error?: { message?: string };
}

interface VoiceSessionState {
  monitorStatus: "CONNECTING" | "ACTIVE" | "FAILED" | "CLOSED";
  safetyBlocked: boolean;
  safetyState: string;
  safetyTarget: string;
  interruptVersion: number;
}

const monitors = new Map<string, MomoLiveSideband>();

function boundedAppend(current: string, delta: string): string {
  return `${current}${delta}`.slice(-MAX_TRANSCRIPT_CHARS);
}

function eventId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

class MomoLiveSideband {
  private readonly socket: WebSocket;
  private readonly sessionRef: DocumentReference;
  private history: ConversationTurn[];
  private continuityState: MomoLiveBootstrap["continuityState"];
  private safetyEvaluation: SafetyEvaluation | undefined;
  private userTranscript = "";
  private assistantTranscript = "";
  private safetyTimer: NodeJS.Timeout | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private work = Promise.resolve();
  private safetyRevision = 0;
  private processedSafetyRevision = 0;
  private interruptVersion = 0;
  private lastSafetyFingerprint = "";
  private truthfulnessInterrupted = false;
  private closed = false;

  constructor(
    private readonly providerSessionId: string,
    private readonly apiKey: string,
    private readonly safetyIdentifier: string,
    private readonly bootstrap: MomoLiveBootstrap
  ) {
    this.history = [...bootstrap.history];
    this.continuityState = bootstrap.continuityState;
    this.safetyEvaluation = bootstrap.safetyEvaluation;
    this.sessionRef = getAdminDb().collection("users").doc(bootstrap.userId)
      .collection("sessions").doc(bootstrap.sessionId);
    this.socket = new WebSocket(
      `wss://api.openai.com/v1/live/sessions/${encodeURIComponent(providerSessionId)}/attach`,
      { headers: {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Safety-Identifier": safetyIdentifier,
      } }
    );
  }

  async open(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out attaching the Momo safety monitor.")), SIDEBAND_OPEN_TIMEOUT_MS);
      const onOpen = () => {
        clearTimeout(timer);
        this.socket.off("error", onError);
        resolve();
      };
      const onError = (error: Error) => {
        clearTimeout(timer);
        this.socket.off("open", onOpen);
        reject(error);
      };
      this.socket.once("open", onOpen);
      this.socket.once("error", onError);
    });
    this.socket.on("message", (data) => this.onMessage(data.toString()));
    this.socket.on("close", () => void this.failClosed("The safety monitor disconnected."));
    this.socket.on("error", (error) => {
      console.error("MOMO LIVE SIDEBAND ERROR:", error);
      void this.failClosed("The safety monitor failed.");
    });
    await this.writeState({
      monitorStatus: "ACTIVE",
      safetyBlocked: this.safetyEvaluation?.state !== undefined && this.safetyEvaluation.state !== "NORMAL",
      safetyState: this.safetyEvaluation?.state ?? "NORMAL",
      safetyTarget: this.safetyEvaluation?.safetyTarget ?? "NONE",
      interruptVersion: this.interruptVersion,
    }, true);
    this.heartbeat = setInterval(() => {
      void this.sessionRef.set({
        liveVoice: { monitorHeartbeatAt: FieldValue.serverTimestamp() },
      }, { merge: true });
    }, HEARTBEAT_MS);
  }

  private onMessage(raw: string): void {
    let event: LiveEvent;
    try {
      event = JSON.parse(raw) as LiveEvent;
    } catch {
      return;
    }
    if (event.type === "session.input_transcript.delta" && typeof event.delta === "string") {
      if (this.assistantTranscript.trim()) void this.persistAssistantTranscript();
      this.truthfulnessInterrupted = false;
      this.userTranscript = boundedAppend(this.userTranscript, event.delta);
      this.safetyRevision += 1;
      this.scheduleSafetyCheck();
      return;
    }
    if (event.type === "session.output_transcript.delta" && typeof event.delta === "string") {
      this.assistantTranscript = boundedAppend(this.assistantTranscript, event.delta);
      const truthfulTranscript = enforceBackendActionTruthfulness(this.assistantTranscript);
      if (truthfulTranscript !== this.assistantTranscript && !this.truthfulnessInterrupted) {
        this.truthfulnessInterrupted = true;
        this.assistantTranscript = truthfulTranscript;
        this.enqueue(() => this.interruptUnconfirmedActionClaim());
      }
      return;
    }
    if (event.type === "session.delegation.created" && event.delegation?.target === "client" && event.delegation.id) {
      const delegationId = event.delegation.id;
      this.enqueue(async () => {
        await new Promise((resolve) => setTimeout(resolve, TRANSCRIPT_SETTLE_MS));
        await this.processDelegation(delegationId);
      });
      return;
    }
    if (event.type === "session.closed") {
      void this.closeCleanly();
      return;
    }
    if (event.type === "error") {
      console.error("MOMO LIVE PROVIDER EVENT ERROR:", event.error?.message ?? raw);
    }
  }

  private enqueue(task: () => Promise<void>): void {
    this.work = this.work.then(task, task).catch((error) => {
      console.error("MOMO LIVE SIDEBAND WORK ERROR:", error);
      return this.failClosed("Trusted voice processing failed.");
    });
  }

  private scheduleSafetyCheck(): void {
    if (this.safetyTimer) clearTimeout(this.safetyTimer);
    this.safetyTimer = setTimeout(() => {
      const revision = this.safetyRevision;
      this.enqueue(() => this.assessAccumulatedSpeech(revision));
    }, TRANSCRIPT_SETTLE_MS);
  }

  private inputFor(messageText: string): NormalizedConversationInput {
    return {
      messageText,
      history: this.history.slice(-12),
      continuityState: prepareContinuityState({ messageText }, this.continuityState),
      participant: this.bootstrap.participant,
      previousSafetyEvaluation: this.safetyEvaluation,
    };
  }

  private async assessAccumulatedSpeech(revision: number): Promise<void> {
    if (revision <= this.processedSafetyRevision || !this.userTranscript.trim()) return;
    const evaluation = await assessMomoTurnSafety(this.inputFor(this.userTranscript.trim()));
    this.processedSafetyRevision = revision;
    if (evaluation.state === "NORMAL") return;
    await this.handleSafety(this.userTranscript.trim(), evaluation, safetyResponseFor(evaluation, {
      messageText: this.userTranscript.trim(),
    }));
  }

  private async processDelegation(delegationId: string): Promise<void> {
    const messageText = this.userTranscript.trim();
    this.userTranscript = "";
    if (!messageText) {
      this.send({
        type: "session.instructions.append",
        event_id: eventId("missing_transcript"),
        delegation_id: delegationId,
        content: "The trusted backend did not receive enough transcript to respond. Ask the user once, briefly, to repeat what they said.",
      });
      return;
    }

    const input = this.inputFor(messageText);
    const outcome = await orchestrateMomoTurn(input, {
      evaluateSafety: (_text, normalizedInput) => assessMomoTurnSafety(normalizedInput!),
      plan: planMomoResponseWithInference,
      respond: generateMomoResponse,
      safetyResponse: (evaluation, normalizedInput) => safetyResponseFor(evaluation, {
        messageText: normalizedInput?.messageText,
      }),
    });
    if (outcome.kind === "SAFETY_RESPONSE") {
      await this.handleSafety(messageText, outcome.safety, outcome.message, delegationId);
      return;
    }
    this.safetyEvaluation = outcome.safety;

    const finalized = finalizeContinuityState(input.continuityState!, outcome.decision!, outcome.message);
    this.continuityState = finalized.state;
    this.history = [
      ...this.history,
      { role: "USER" as const, text: messageText },
      { role: "MOMO" as const, text: outcome.message },
    ].slice(-12);
    const messageId = crypto.randomUUID();
    await this.sessionRef.firestore.runTransaction(async (transaction) => {
      transaction.set(this.sessionRef.collection("messages").doc(`${messageId}-user`), {
        text: messageText,
        sender: "USER",
        source: "VOICE",
        provenance: "SERVER_LIVE_SIDEBAND",
        order: 0,
        timestamp: FieldValue.serverTimestamp(),
      });
      transaction.set(this.sessionRef, {
        title: messageText.slice(0, 64),
        continuityState: finalized.state,
        safetyEvaluation: outcome.safety,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    this.send({
      type: "session.commentary.append",
      event_id: eventId("momo_reply"),
      delegation_id: delegationId,
      content: `Deliver this approved Momo response faithfully. Preserve its meaning and do not add any facts, interpretations, advice, or action claims: ${outcome.message}`,
    });
  }

  private async handleSafety(
    userText: string,
    evaluation: SafetyEvaluation,
    responseText: string,
    delegationId: string | null = null
  ): Promise<void> {
    const fingerprint = `${userText}\n${evaluation.state}\n${evaluation.assessmentStep}`;
    const isNewSafetyTurn = fingerprint !== this.lastSafetyFingerprint;
    this.safetyEvaluation = evaluation;
    if (!isNewSafetyTurn) return;
    this.lastSafetyFingerprint = fingerprint;
    this.interruptVersion += 1;
    this.send({
      type: "session.instructions.append",
      event_id: eventId("safety_interrupt"),
      delegation_id: delegationId,
      content: `Stop ordinary speech immediately and do not resume it. Safety is now controlled by the application. Say exactly this, with a calm direct delivery and no additions: ${JSON.stringify(responseText)}`,
    });
    await this.writeState({
      monitorStatus: "ACTIVE",
      safetyBlocked: true,
      safetyState: evaluation.state,
      safetyTarget: evaluation.safetyTarget,
      interruptVersion: this.interruptVersion,
    });
    await this.sessionRef.set({ safetyEvaluation: evaluation }, { merge: true });
    if (isNewSafetyTurn) {
      const safetyEventId = await recordMomoSafetyEvent({
        db: this.sessionRef.firestore,
        userId: this.bootstrap.userId,
        sessionId: this.bootstrap.sessionId,
        userText,
        source: "VOICE",
        evaluation,
        responseText,
      });
      if (shouldAttemptSafetySupportNotification(evaluation) && safetySupportNotificationsEnabled()) {
        void this.notifySafetySupport(safetyEventId, evaluation);
      }
    }
  }

  private async notifySafetySupport(eventId: string, evaluation: SafetyEvaluation & {
    state: "IMMINENT" | "MEDICAL_EMERGENCY";
  }): Promise<void> {
    const eventRef = this.sessionRef.firestore.collection("users")
      .doc(this.bootstrap.userId).collection("safety_events").doc(eventId);
    try {
      await eventRef.update({
        supportNotificationStatus: "REQUESTED",
        supportNotificationUpdatedAt: FieldValue.serverTimestamp(),
      });
      await eventRef.update({
        supportNotificationStatus: "STARTED",
        supportNotificationUpdatedAt: FieldValue.serverTimestamp(),
      });
      const status = await notifySafetySupport({
        eventId,
        category: evaluation.deterministic.category,
        safetyTarget: evaluation.safetyTarget,
        source: "VOICE",
        state: evaluation.state,
      });
      await eventRef.update({
        supportNotificationStatus: status,
        supportNotificationUpdatedAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      console.error("MOMO LIVE SAFETY NOTIFICATION ERROR:", error);
      await eventRef.update({
        supportNotificationStatus: "FAILED",
        supportNotificationUpdatedAt: FieldValue.serverTimestamp(),
      }).catch(() => undefined);
    }
  }

  private async interruptUnconfirmedActionClaim(): Promise<void> {
    this.interruptVersion += 1;
    this.send({
      type: "session.instructions.append",
      event_id: eventId("truthfulness_interrupt"),
      delegation_id: null,
      content: "Stop speaking immediately. Do not claim that any external person or service was contacted or connected. Say exactly: I can’t confirm that any external service or person has been contacted.",
    });
    await this.writeState({
      monitorStatus: "ACTIVE",
      safetyBlocked: this.safetyEvaluation?.state !== undefined && this.safetyEvaluation.state !== "NORMAL",
      safetyState: this.safetyEvaluation?.state ?? "NORMAL",
      safetyTarget: this.safetyEvaluation?.safetyTarget ?? "NONE",
      interruptVersion: this.interruptVersion,
    });
  }

  private async persistAssistantTranscript(): Promise<void> {
    const text = this.assistantTranscript.trim();
    this.assistantTranscript = "";
    if (!text) return;
    await this.sessionRef.collection("messages").doc().set({
      text,
      sender: "MOMO",
      source: "VOICE",
      provenance: "SERVER_LIVE_SIDEBAND_TRANSCRIPT",
      order: 1,
      timestamp: FieldValue.serverTimestamp(),
    });
  }

  private send(payload: Record<string, unknown>): void {
    if (this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Momo Live safety sideband is not open.");
    }
    this.socket.send(JSON.stringify(payload));
  }

  private async writeState(state: VoiceSessionState, started = false): Promise<void> {
    await this.sessionRef.set({
      liveVoice: {
        provider: "openai",
        model: "gpt-live-1",
        ...state,
        ...(started ? { startedAt: FieldValue.serverTimestamp() } : {}),
        monitorHeartbeatAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
    }, { merge: true });
  }

  private async failClosed(reason: string): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.safetyTimer) clearTimeout(this.safetyTimer);
    monitors.delete(this.providerSessionId);
    await this.sessionRef.set({
      liveVoice: {
        monitorStatus: "FAILED",
        failureReason: reason,
        updatedAt: FieldValue.serverTimestamp(),
      },
    }, { merge: true }).catch(() => undefined);
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "session.close", event_id: eventId("fail_closed") }));
    }
    this.socket.close();
  }

  private async closeCleanly(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.safetyTimer) clearTimeout(this.safetyTimer);
    monitors.delete(this.providerSessionId);
    await this.persistAssistantTranscript().catch(() => undefined);
    await this.sessionRef.set({
      liveVoice: {
        monitorStatus: "CLOSED",
        endedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
    }, { merge: true });
    this.socket.close();
  }
}

export async function attachMomoLiveSideband(options: {
  providerSessionId: string;
  apiKey: string;
  safetyIdentifier: string;
  bootstrap: MomoLiveBootstrap;
}): Promise<void> {
  const existing = monitors.get(options.providerSessionId);
  if (existing) return;
  const monitor = new MomoLiveSideband(
    options.providerSessionId,
    options.apiKey,
    options.safetyIdentifier,
    options.bootstrap
  );
  monitors.set(options.providerSessionId, monitor);
  try {
    await monitor.open();
  } catch (error) {
    monitors.delete(options.providerSessionId);
    throw error;
  }
}
