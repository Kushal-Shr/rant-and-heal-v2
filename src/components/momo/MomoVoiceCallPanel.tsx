"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MomoPortrait } from "@/src/components/shared/MomoPortrait";
import { Spinner } from "@/src/components/ui/Spinner";
import { useAuth } from "@/src/context/AuthContext";
import { MomoLiveClient } from "@/src/lib/momo/live/MomoLiveClient";

type CallState = "IDLE" | "CONNECTING" | "CONNECTED" | "DISCONNECTED" | "ERROR";
type LiveStatus = "idle" | "connecting" | "ready" | "listening" | "speaking";
type PermissionState = "prompt" | "granted" | "denied";

interface MonitorStatus {
  monitorStatus?: "CONNECTING" | "ACTIVE" | "FAILED" | "CLOSED";
  safetyBlocked?: boolean;
  safetyState?: string;
  interruptVersion?: number;
  heartbeatAgeMs?: number | null;
  error?: string;
}

interface MomoVoiceCallPanelProps {
  embedded?: boolean;
  conversationId?: string | null;
  onCallActiveChange?: (active: boolean) => void;
  onTranscriptDelta?: (sender: "USER" | "MOMO", delta: string) => void;
}

const MAX_CAPTION_CHARS = 260;

export function MomoVoiceCallPanel({
  embedded = false,
  conversationId,
  onCallActiveChange,
  onTranscriptDelta,
}: MomoVoiceCallPanelProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [callState, setCallState] = useState<CallState>("IDLE");
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("idle");
  const [permissionState, setPermissionState] = useState<PermissionState>("prompt");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [callNotice, setCallNotice] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [safetyState, setSafetyState] = useState("NORMAL");
  const [userCaption, setUserCaption] = useState("");
  const [momoCaption, setMomoCaption] = useState("");
  const liveClientRef = useRef<MomoLiveClient | null>(null);
  const monitorTimerRef = useRef<number | null>(null);
  const setupTimeoutRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const interruptVersionRef = useRef(0);
  const liveStatusRef = useRef<LiveStatus>("idle");
  const intentionalCloseRef = useRef(false);

  function updateLiveStatus(status: LiveStatus) {
    liveStatusRef.current = status;
    setLiveStatus(status);
  }

  function clearTimers() {
    if (monitorTimerRef.current !== null) window.clearInterval(monitorTimerRef.current);
    if (setupTimeoutRef.current !== null) window.clearTimeout(setupTimeoutRef.current);
    monitorTimerRef.current = null;
    setupTimeoutRef.current = null;
  }

  function releaseResources() {
    generationRef.current += 1;
    clearTimers();
    liveClientRef.current?.forceClose();
    liveClientRef.current = null;
    updateLiveStatus("idle");
    setMuted(false);
    onCallActiveChange?.(false);
  }

  async function endCall() {
    intentionalCloseRef.current = true;
    clearTimers();
    const client = liveClientRef.current;
    liveClientRef.current = null;
    await client?.close();
    updateLiveStatus("idle");
    setMuted(false);
    setCallState("DISCONNECTED");
    setErrorMessage(null);
    setCallNotice(null);
    onCallActiveChange?.(false);
    if (!embedded && conversationId) {
      router.push(`/momo?conversationId=${encodeURIComponent(conversationId)}`);
    }
  }

  useEffect(() => {
    if (!loading && !user) router.push("/auth/login");
  }, [loading, router, user]);

  useEffect(() => () => {
    generationRef.current += 1;
    if (monitorTimerRef.current !== null) window.clearInterval(monitorTimerRef.current);
    if (setupTimeoutRef.current !== null) window.clearTimeout(setupTimeoutRef.current);
    liveClientRef.current?.forceClose();
    liveClientRef.current = null;
  }, []);

  async function failClosed(message: string) {
    intentionalCloseRef.current = true;
    clearTimers();
    const client = liveClientRef.current;
    liveClientRef.current = null;
    await client?.close().catch(() => client.forceClose());
    setCallState("ERROR");
    updateLiveStatus("idle");
    setErrorMessage(message);
    onCallActiveChange?.(false);
  }

  function beginMonitorPolling(generation: number) {
    monitorTimerRef.current = window.setInterval(async () => {
      if (!user || !conversationId || generationRef.current !== generation) return;
      try {
        const idToken = await user.getIdToken();
        const response = await fetch(
          `/api/momo/live-session/status?conversationId=${encodeURIComponent(conversationId)}`,
          { headers: { Authorization: `Bearer ${idToken}` } }
        );
        const status = (await response.json().catch(() => null)) as MonitorStatus | null;
        if (!response.ok || !status || status.monitorStatus === "FAILED" ||
            (typeof status.heartbeatAgeMs === "number" && status.heartbeatAgeMs > 15_000)) {
          await failClosed("Momo voice paused because trusted safety monitoring became unavailable.");
          return;
        }
        if (status.monitorStatus === "CLOSED" && !intentionalCloseRef.current) {
          await failClosed("The monitored voice session ended.");
          return;
        }
        setSafetyState(status.safetyState ?? "NORMAL");
        const version = status.interruptVersion ?? 0;
        if (version > interruptVersionRef.current) {
          interruptVersionRef.current = version;
          liveClientRef.current?.interruptPlayback();
        }
      } catch {
        await failClosed("Momo voice paused because trusted safety monitoring became unavailable.");
      }
    }, 1_000);
  }

  async function startCall() {
    if (!user || !conversationId) {
      setErrorMessage("Create or select a conversation before calling.");
      return;
    }
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    intentionalCloseRef.current = false;
    interruptVersionRef.current = 0;
    setCallState("CONNECTING");
    updateLiveStatus("connecting");
    setErrorMessage(null);
    setCallNotice(null);
    setSafetyState("NORMAL");
    setUserCaption("");
    setMomoCaption("");
    onCallActiveChange?.(true);

    try {
      const idToken = await user.getIdToken();
      const client = new MomoLiveClient({
        idToken,
        conversationId,
        onReady: () => {
          if (generationRef.current !== generation) return;
          if (setupTimeoutRef.current !== null) window.clearTimeout(setupTimeoutRef.current);
          setupTimeoutRef.current = null;
          setPermissionState("granted");
          setCallState("CONNECTED");
          updateLiveStatus("ready");
          beginMonitorPolling(generation);
        },
        onTranscriptDelta: (sender, delta) => {
          const update = (current: string) => `${current}${delta}`.slice(-MAX_CAPTION_CHARS);
          if (sender === "USER") setUserCaption(update);
          else setMomoCaption(update);
          onTranscriptDelta?.(sender, delta);
        },
        onListening: () => {
          if (generationRef.current !== generation) return;
          if (liveStatusRef.current === "speaking") client.interruptPlayback();
          updateLiveStatus("listening");
        },
        onSpeaking: () => {
          if (generationRef.current === generation) {
            setCallNotice(null);
            updateLiveStatus("speaking");
          }
        },
        onInterrupted: () => {
          if (generationRef.current === generation) updateLiveStatus("listening");
        },
        onModeration: (message) => {
          if (generationRef.current !== generation) return;
          console.warn("GPT-Live paused a moderated generation.");
          setCallNotice(message);
          updateLiveStatus("listening");
        },
        onError: (error) => {
          if (generationRef.current !== generation) return;
          console.error("GPT-Live error:", error);
          void failClosed("The GPT-Live connection was lost.");
        },
        onClose: (clean) => {
          if (generationRef.current !== generation) return;
          releaseResources();
          if (intentionalCloseRef.current || clean) {
            setCallState("DISCONNECTED");
            setErrorMessage(null);
          } else {
            setCallState("ERROR");
            setErrorMessage("The GPT-Live connection ended unexpectedly.");
          }
        },
      });
      liveClientRef.current = client;
      setupTimeoutRef.current = window.setTimeout(() => {
        if (generationRef.current === generation && callState !== "CONNECTED") {
          void failClosed("Momo did not finish connecting. Please try again.");
        }
      }, 20_000);
      await client.connect();
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        setPermissionState("denied");
      }
      console.error("MOMO VOICE START ERROR:", error);
      await failClosed(error instanceof Error ? error.message : "Could not access the microphone.");
    }
  }

  function toggleMute() {
    const nextMuted = !muted;
    liveClientRef.current?.setMuted(nextMuted);
    setMuted(nextMuted);
    if (!nextMuted) updateLiveStatus("listening");
  }

  if (loading) {
    return <div className="flex min-h-40 items-center justify-center"><Spinner size="lg" label="Loading Momo..." /></div>;
  }
  if (!user) return null;

  const isCallable = Boolean(conversationId);
  const statusText = callState === "IDLE"
    ? conversationId ? "Ready to continue this conversation by voice." : "Create or select a chat before calling."
    : callState === "CONNECTING" ? "Connecting securely..."
      : callState === "CONNECTED" && muted ? "Microphone muted."
        : callState === "CONNECTED" && liveStatus === "speaking" ? "Momo is speaking"
          : callState === "CONNECTED" && liveStatus === "listening" ? "Listening..."
            : callState === "CONNECTED" ? "Connected"
              : callState === "DISCONNECTED" ? "Call ended."
                : errorMessage ?? "Something went wrong.";
  const active = callState === "CONNECTING" || callState === "CONNECTED";

  return (
    <div className={embedded
      ? "border-b border-[#ffeada] bg-[#fff8f5]/80 px-4 py-3 sm:px-6"
      : "flex min-h-[75dvh] flex-col items-center justify-center gap-6 py-6 text-[#2c1601]"}>
      {!embedded && <Link className="self-start rounded-full bg-white/70 px-4 py-2 text-sm text-[#325347]" href={conversationId ? `/momo?conversationId=${encodeURIComponent(conversationId)}` : "/momo"}>← Back to conversation</Link>}
      <div className={embedded
        ? "mx-auto flex max-w-3xl flex-col gap-4 rounded-[1.5rem] border border-white/80 bg-white/80 p-4 shadow-[0_12px_28px_-18px_rgba(121,88,65,0.25),inset_0_2px_4px_rgba(255,255,255,0.8)] sm:flex-row sm:items-center sm:justify-between"
        : "flex w-full max-w-md flex-col items-center rounded-[2.5rem] border border-white/80 bg-white/80 p-8 shadow-[0_20px_40px_-20px_rgba(121,88,65,0.24),inset_0_2px_4px_rgba(255,255,255,0.8)]"}>
        <div className={embedded ? "flex items-center gap-4" : "flex flex-col items-center"}>
          <div className={embedded ? "relative flex h-16 w-16 items-center justify-center" : "relative mb-8 flex h-48 w-48 items-center justify-center"}>
            <div className={`absolute inset-0 rounded-full bg-[#abcebf] ${liveStatus === "speaking" ? "animate-ping" : ""}`} style={{ opacity: liveStatus === "speaking" ? 0.6 : 0.2 }} />
            <MomoPortrait className={embedded ? "relative z-10 size-12" : "relative z-10 size-40"} />
          </div>
          <div className={embedded ? "" : "text-center"}>
            <p className="font-['Plus_Jakarta_Sans'] text-xs font-medium uppercase tracking-[0.12em] text-[#4a6b5e]/70">Momo AI Voice</p>
            <h2 className={embedded ? "mt-1 font-['Plus_Jakarta_Sans'] text-lg font-medium text-[#325347]" : "mb-3 mt-2 text-center text-3xl font-medium tracking-[-0.03em] text-[#325347]"}>Talk to Momo</h2>
            <p aria-live="polite" className={`font-['Plus_Jakarta_Sans'] text-sm ${callState === "ERROR" ? "text-[#ba1a1a]" : "text-[#414845]"}`}>{statusText}</p>
            {embedded && active ? <p className="mt-1 text-xs text-[#596c60]">Live captions appear in the conversation below.</p> : null}
            {callNotice && callState === "CONNECTED" && <p role="status" className="mt-2 rounded-xl bg-[#fff8e8] px-3 py-2 text-xs text-[#654f18]">{callNotice}</p>}
            {permissionState === "denied" && <p className="mt-2 text-xs text-[#93000a]">Microphone permission was denied. Enable it in browser settings to try again.</p>}
            {safetyState !== "NORMAL" && <p className="mt-2 rounded-xl bg-[#fff1e8] px-3 py-2 text-xs text-[#6f3b16]">Momo is focused on immediate safety. <Link className="underline" href="/crisis?source=momo-voice">Open crisis support</Link></p>}
            {!embedded && active && (userCaption || momoCaption) && (
              <div className="mt-4 max-h-28 overflow-y-auto rounded-2xl bg-[#f5faf7] p-3 text-left text-xs text-[#414845]" aria-live="polite">
                {userCaption && <p><span className="font-semibold">You:</span> {userCaption}</p>}
                {momoCaption && <p className="mt-2"><span className="font-semibold">Momo:</span> {momoCaption}</p>}
              </div>
            )}
          </div>
        </div>

        <div className={embedded ? "flex gap-2" : "mt-5 flex w-full gap-3"}>
          {!active ? (
            <button className="flex-1 rounded-full bg-[#325347] px-5 py-3 text-sm font-medium text-white shadow-[0_8px_16px_-6px_rgba(50,83,71,0.3)] transition-all hover:bg-[#4a6b5e] active:scale-95 disabled:pointer-events-none disabled:opacity-50" disabled={!isCallable} onClick={() => void startCall()}>Start call</button>
          ) : (
            <>
              <button className="flex-1 rounded-full bg-[#edf5f1] px-4 py-3 text-sm font-medium text-[#325347]" disabled={callState !== "CONNECTED"} onClick={toggleMute}>{muted ? "Unmute" : "Mute"}</button>
              <button className="flex-1 rounded-full bg-[#ffdad6] px-4 py-3 text-sm font-medium text-[#93000a]" onClick={() => void endCall()}>End call</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
