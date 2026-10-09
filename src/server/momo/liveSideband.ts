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
import {
  buildMomoLiveOpeningInstruction,
  type MomoLiveBootstrap,
} from "@/src/server/momo/liveSession";

const SIDEBAND_OPEN_TIMEOUT_MS = 5_000;
const TRANSCRIPT_SETTLE_MS = 180;
const HEARTBEAT_MS = 5_000;
const MAX_TRANSCRIPT_CHARS = 8_000;
const THINKING_UPDATE_DELAY_MS = 750;

interface LiveEvent {
  type?: string;
  delta?: string;
  end_ms?: number;
  client_event_id?: string;
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
const conversationMonitors = new Map<string, MomoLiveSideband>();

function conversationMonitorKey(userId: string, conversationId: string): string {
  return `${userId}:${conversationId}`;
}

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
  private openingSent = false;
  private openingEventId: string | null = null;
  private progressIndex = 0;
  private readonly progressTimers = new Map<string, NodeJS.Timeout>();
  private closed = false;
  private readonly conversationKey: string;

  constructor(
    private readonly providerSessionId: string,
    private readonly apiKey: string,
    private readonly safetyIdentifier: string,
    private readonly bootstrap: MomoLiveBootstrap
  ) {
    this.history = [...bootstrap.history];
    this.continuityState = bootstrap.continuityState;
    this.safetyEvaluation = bootstrap.safetyEvaluation;
    this.conversationKey = conversationMonitorKey(bootstrap.userId, bootstrap.conversationId);
    this.sessionRef = getAdminDb().collection("users").doc(bootstrap.userId)
      .collection("sessions").doc(bootstrap.conversationId);
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
      void this.refreshHeartbeat();
    }, HEARTBEAT_MS);
  }

  replaceForReconnect(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.safetyTimer) clearTimeout(this.safetyTimer);
    this.clearAllThinkingUpdates();
    monitors.delete(this.providerSessionId);
    if (conversationMonitors.get(this.conversationKey) === this) {
      conversationMonitors.delete(this.conversationKey);
    }
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "session.close", event_id: eventId("reconnect") }));
    }
    this.socket.close();
  }

  private onMessage(raw: string): void {
    let event: LiveEvent;
    try {
      event = JSON.parse(raw) as LiveEvent;
    } catch {
      return;
    }
    if (event.type === "session.started") {
      this.sendOpeningOnce();
      return;
    }
    if (event.type === "session.instructions.appended" &&
        event.client_event_id === this.openingEventId) {
      this.openingEventId = null;
      return;
    }
    if (event.type === "session.input_transcript.delta" && typeof event.delta === "string") {
      // Assistant speech is display-only here. The backend-approved response
      // is persisted atomically with its user turn during delegation.
      this.assistantTranscript = "";
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
      this.scheduleThinkingUpdate(delegationId);
      this.enqueue(async () => {
        try {
          await new Promise((resolve) => setTimeout(resolve, TRANSCRIPT_SETTLE_MS));
          await this.processDelegation(delegationId);
        } finally {
          this.clearThinkingUpdate(delegationId);
        }
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

  private sendOpeningOnce(): void {
    if (this.openingSent) return;
    this.openingSent = true;
    this.openingEventId = eventId("momo_opening");
    this.send({
      type: "session.instructions.append",
      event_id: this.openingEventId,
      delegation_id: null,
      content: buildMomoLiveOpeningInstruction(this.bootstrap),
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
    if (!await this.isCurrentConnection()) {
      this.replaceForReconnect();
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
      const conversation = await transaction.get(this.sessionRef);
      if (conversation.data()?.liveVoice?.connectionId !== this.providerSessionId) {
        throw new Error("This GPT-Live connection was replaced by a newer connection.");
      }
      transaction.set(this.sessionRef.collection("messages").doc(`${messageId}-user`), {
        text: messageText,
        sender: "USER",
        source: "VOICE",
        modality: "VOICE",
        provenance: "SERVER_LIVE_SIDEBAND",
        order: 0,
        timestamp: FieldValue.serverTimestamp(),
      });
      transaction.set(this.sessionRef.collection("messages").doc(`${messageId}-momo`), {
        text: outcome.message,
        sender: "MOMO",
        source: "VOICE",
        modality: "VOICE",
        provenance: "SERVER_LIVE_SIDEBAND",
        order: 1,
        continuityMetadata: finalized.metadata,
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

  private scheduleThinkingUpdate(delegationId: string): void {
    this.clearThinkingUpdate(delegationId);
    const timer = setTimeout(() => {
      this.progressTimers.delete(delegationId);
      if (this.closed || this.socket.readyState !== WebSocket.OPEN) return;
      try {
        this.sendThinkingUpdate(delegationId);
      } catch (error) {
        console.error("MOMO LIVE THINKING UPDATE ERROR:", error);
      }
    }, THINKING_UPDATE_DELAY_MS);
    this.progressTimers.set(delegationId, timer);
  }

  private clearThinkingUpdate(delegationId: string): void {
    const timer = this.progressTimers.get(delegationId);
    if (timer) clearTimeout(timer);
    this.progressTimers.delete(delegationId);
  }

  private clearAllThinkingUpdates(): void {
    for (const timer of this.progressTimers.values()) clearTimeout(timer);
    this.progressTimers.clear();
  }

  private sendThinkingUpdate(delegationId: string): void {
    const updates = [
      "You are still present with the caller and are taking a moment to think carefully about what they said.",
      "You are taking a brief moment so you can respond thoughtfully to the caller.",
      "You are still with the caller and are considering their words before you respond.",
    ];
    const content = updates[this.progressIndex % updates.length];
    this.progressIndex += 1;
    this.send({
      type: "session.commentary.append",
      event_id: eventId("momo_thinking_update"),
      delegation_id: delegationId,
      content,
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
    this.clearAllThinkingUpdates();
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
        sessionId: this.bootstrap.conversationId,
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

  private send(payload: Record<string, unknown>): void {
    if (this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Momo Live safety sideband is not open.");
    }
    this.socket.send(JSON.stringify(payload));
  }

  private async isCurrentConnection(): Promise<boolean> {
    const conversation = await this.sessionRef.get();
    return conversation.data()?.liveVoice?.connectionId === this.providerSessionId;
  }

  private async refreshHeartbeat(): Promise<void> {
    let replaced = false;
    await this.sessionRef.firestore.runTransaction(async (transaction) => {
      const conversation = await transaction.get(this.sessionRef);
      if (conversation.data()?.liveVoice?.connectionId !== this.providerSessionId) {
        replaced = true;
        return;
      }
      transaction.set(this.sessionRef, {
        liveVoice: { monitorHeartbeatAt: FieldValue.serverTimestamp() },
      }, { merge: true });
    }).catch((error) => {
      console.error("MOMO LIVE HEARTBEAT ERROR:", error);
    });
    if (replaced) this.replaceForReconnect();
  }

  private async writeState(state: VoiceSessionState, started = false): Promise<void> {
    const update = {
      liveVoice: {
        provider: "openai",
        model: "gpt-live-1",
        connectionId: this.providerSessionId,
        ...state,
        ...(started ? { startedAt: FieldValue.serverTimestamp() } : {}),
        monitorHeartbeatAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
    };
    if (started) {
      await this.sessionRef.set(update, { merge: true });
      return;
    }
    await this.sessionRef.firestore.runTransaction(async (transaction) => {
      const conversation = await transaction.get(this.sessionRef);
      if (conversation.data()?.liveVoice?.connectionId !== this.providerSessionId) {
        throw new Error("This GPT-Live connection was replaced by a newer connection.");
      }
      transaction.set(this.sessionRef, update, { merge: true });
    });
  }

  private async failClosed(reason: string): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.safetyTimer) clearTimeout(this.safetyTimer);
    this.clearAllThinkingUpdates();
    monitors.delete(this.providerSessionId);
    if (conversationMonitors.get(this.conversationKey) === this) {
      conversationMonitors.delete(this.conversationKey);
    }
    await this.sessionRef.firestore.runTransaction(async (transaction) => {
      const conversation = await transaction.get(this.sessionRef);
      if (conversation.data()?.liveVoice?.connectionId !== this.providerSessionId) return;
      transaction.set(this.sessionRef, {
        liveVoice: {
          monitorStatus: "FAILED",
          failureReason: reason,
          updatedAt: FieldValue.serverTimestamp(),
        },
      }, { merge: true });
    }).catch(() => undefined);
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
    this.clearAllThinkingUpdates();
    monitors.delete(this.providerSessionId);
    if (conversationMonitors.get(this.conversationKey) === this) {
      conversationMonitors.delete(this.conversationKey);
    }
    await this.sessionRef.firestore.runTransaction(async (transaction) => {
      const conversation = await transaction.get(this.sessionRef);
      if (conversation.data()?.liveVoice?.connectionId !== this.providerSessionId) return;
      transaction.set(this.sessionRef, {
        liveVoice: {
          monitorStatus: "CLOSED",
          endedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
      }, { merge: true });
    });
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
  const conversationKey = conversationMonitorKey(
    options.bootstrap.userId,
    options.bootstrap.conversationId
  );
  conversationMonitors.get(conversationKey)?.replaceForReconnect();
  const monitor = new MomoLiveSideband(
    options.providerSessionId,
    options.apiKey,
    options.safetyIdentifier,
    options.bootstrap
  );
  monitors.set(options.providerSessionId, monitor);
  conversationMonitors.set(conversationKey, monitor);
  try {
    await monitor.open();
  } catch (error) {
    monitors.delete(options.providerSessionId);
    if (conversationMonitors.get(conversationKey) === monitor) {
      conversationMonitors.delete(conversationKey);
    }
    throw error;
  }
}
