"use client";

import Link from "next/link";
import { MomoPortrait } from "@/src/components/shared/MomoPortrait";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/src/components/ui/Spinner";
import { useAuth } from "@/src/context/AuthContext";
import { AudioRecorder } from "@/src/lib/momo/audio/AudioRecorder";
import { AudioStreamer } from "@/src/lib/momo/audio/AudioStreamer";
import { MomoLiveClient } from "@/src/lib/momo/live/MomoLiveClient";

type CallState = "IDLE" | "CONNECTING" | "CONNECTED" | "DISCONNECTED" | "ERROR";
type LiveStatus = "idle" | "connecting" | "ready" | "listening";
type AudioContextWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

interface LiveTokenResponse {
  token?: string;
  model?: string;
  error?: string;
}

interface TranscriptResponse {
  safety?: { level?: string };
  error?: string;
}

interface MomoVoiceCallPanelProps {
  embedded?: boolean;
  sessionId?: string | null;
}

export function MomoVoiceCallPanel({ embedded = false, sessionId }: MomoVoiceCallPanelProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [callState, setCallState] = useState<CallState>("IDLE");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPulseActive, setIsPulseActive] = useState(false);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("idle");

  const recorderRef = useRef<AudioRecorder | null>(null);
  const streamerRef = useRef<AudioStreamer | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const liveClientRef = useRef<MomoLiveClient | null>(null);
  const isBackendReadyRef = useRef(false);
  const intentionalCloseRef = useRef(false);
  const setupTimeoutRef = useRef<number | null>(null);
  const generationRef = useRef(0);

  const cleanupCallResources = () => {
    generationRef.current += 1;
    if (setupTimeoutRef.current) {
      window.clearTimeout(setupTimeoutRef.current);
      setupTimeoutRef.current = null;
    }

    liveClientRef.current?.close();
    liveClientRef.current = null;
    recorderRef.current?.close();
    recorderRef.current = null;
    streamerRef.current?.reset();
    streamerRef.current = null;

    if (playbackContextRef.current) {
      void playbackContextRef.current.close();
      playbackContextRef.current = null;
    }

    isBackendReadyRef.current = false;
    setLiveStatus("idle");
    setIsPulseActive(false);
  };

  const endCall = () => {
    intentionalCloseRef.current = true;
    cleanupCallResources();
    setCallState("IDLE");
    setErrorMessage(null);
  };

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth/login");
    }
  }, [loading, router, user]);

  useEffect(() => {
    return () => {
      cleanupCallResources();
    };
  }, []);

  async function createPlaybackContext() {
    const AudioContextConstructor =
      window.AudioContext || (window as AudioContextWindow).webkitAudioContext;

    if (!AudioContextConstructor) {
      throw new Error("This browser does not support Web Audio.");
    }

    const playbackContext = new AudioContextConstructor();
    playbackContextRef.current = playbackContext;
    streamerRef.current = new AudioStreamer(playbackContext, {
      onPlaybackStart: () => setIsPulseActive(true),
      onPlaybackEnd: () => setIsPulseActive(false),
    });
  }

  async function saveTranscript(sender: "USER" | "MOMO", text: string) {
    if (!user?.uid || !sessionId) {
      console.warn("MOMO TRANSCRIPT SKIPPED:", "missing-user-or-session", { sender, hasUser: Boolean(user?.uid), sessionId });
      return;
    }

    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/momo/transcript", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.uid,
          sessionId,
          requestId: crypto.randomUUID(),
          sender,
          text,
        }),
      });

      const payload = (await response.json().catch(() => null)) as TranscriptResponse | null;
      if (!response.ok) {
        console.error("MOMO TRANSCRIPT ERROR:", response.status, payload?.error ?? "Failed to save transcript.");
        setErrorMessage("The voice transcript could not be saved. Please try the call again.");
        return;
      }

      if (sender === "USER" && payload?.safety?.level === "IMMINENT") {
        intentionalCloseRef.current = true;
        cleanupCallResources();
        setCallState("DISCONNECTED");
        router.push("/crisis?source=momo-voice");
      }
    } catch (error) {
      console.error("MOMO TRANSCRIPT ERROR:", error);
    }
  }

  const startCall = async () => {
    if (!user) {
      return;
    }
    if (!sessionId) {
      setErrorMessage("Create or select a conversation before calling.");
      return;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setCallState("CONNECTING");
    setErrorMessage(null);
    intentionalCloseRef.current = false;
    setLiveStatus("connecting");
    isBackendReadyRef.current = false;

    try {
      const idToken = await user.getIdToken();
      const tokenResponse = await fetch("/api/momo/live-token", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId }),
      });
      const tokenPayload = (await tokenResponse.json().catch(() => null)) as LiveTokenResponse | null;

      if (!tokenResponse.ok || !tokenPayload?.token || !tokenPayload.model) {
        throw new Error(tokenPayload?.error ?? "Could not create a secure Momo voice token.");
      }
      if (generationRef.current !== generation) return;

      await createPlaybackContext();
      if (generationRef.current !== generation) {
        cleanupCallResources();
        return;
      }

      setupTimeoutRef.current = window.setTimeout(() => {
        if (!isBackendReadyRef.current) {
          setCallState("ERROR");
          setErrorMessage("Momo did not finish warming up. Please try again.");
          cleanupCallResources();
        }
      }, 10000);

      const liveClient = new MomoLiveClient({
        token: tokenPayload.token,
        model: tokenPayload.model,
        onReady: () => {
          if (generationRef.current !== generation) return;
          if (setupTimeoutRef.current) {
            window.clearTimeout(setupTimeoutRef.current);
            setupTimeoutRef.current = null;
          }
          isBackendReadyRef.current = true;
          setCallState("CONNECTED");
          setLiveStatus("ready");
        },
        onAudio: (base64Audio) => {
          if (generationRef.current !== generation) return;
          streamerRef.current?.playBase64Pcm16(base64Audio);
        },
        onTranscript: (sender, text) => {
          void saveTranscript(sender, text);
        },
        onTurnComplete: () => {
          if (generationRef.current === generation) setLiveStatus("ready");
        },
        onInterrupted: () => {
          if (generationRef.current === generation) streamerRef.current?.reset();
        },
        onError: (error) => {
          if (generationRef.current !== generation) return;
          console.error("Gemini Live error:", error);
          setCallState("ERROR");
          setErrorMessage("Connection lost.");
          cleanupCallResources();
        },
        onClose: (event) => {
          if (generationRef.current !== generation) return;
          console.log(
            `Gemini Live closed: code=${event.code}, reason=${event.reason}, wasClean=${event.wasClean}`
          );
          cleanupCallResources();

          if (intentionalCloseRef.current || event.code === 1000) {
            setCallState("DISCONNECTED");
            setErrorMessage(null);
            return;
          }

          setCallState("ERROR");
          setErrorMessage(event.reason || "Connection closed before Momo was ready.");
        },
      });
      liveClientRef.current = liveClient;
      await liveClient.connect();
      if (generationRef.current !== generation) {
        liveClient.close();
        return;
      }

      const recorder = new AudioRecorder();
      recorderRef.current = recorder;
      await recorder.start((base64Audio) => {
        if (liveClientRef.current && isBackendReadyRef.current) {
          setLiveStatus("listening");
          liveClientRef.current.sendAudio(base64Audio);
        }
      });
      if (generationRef.current !== generation) recorder.close();
    } catch (err: unknown) {
      console.error(err);
      setCallState("ERROR");
      setErrorMessage(err instanceof Error ? err.message : "Could not access microphone.");
      cleanupCallResources();
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-40 items-center justify-center">
        <Spinner size="lg" label="Loading Momo..." />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const isCallable = Boolean(sessionId);
  const statusText =
    callState === "IDLE"
      ? sessionId
        ? "Ready to call inside this chat."
        : "Ready when you are."
      : callState === "CONNECTING"
        ? "Connecting..."
        : callState === "CONNECTED" && liveStatus === "ready"
          ? "Connected. Rant away!"
          : callState === "CONNECTED" && liveStatus === "listening"
            ? "Listening..."
            : callState === "CONNECTED" && liveStatus === "connecting"
              ? "Warming up Momo..."
              : callState === "DISCONNECTED"
                ? "Call ended."
                : errorMessage ?? "Something went wrong.";

  return (
    <div
      className={
        embedded
          ? "border-b border-[#ffeada] bg-[#fff8f5]/80 px-4 py-3 sm:px-6"
          : "flex min-h-[75dvh] flex-col items-center justify-center gap-6 py-6 text-[#2c1601]"
      }
    >
      {!embedded && <Link className="self-start rounded-full bg-white/70 px-4 py-2 text-sm text-[#325347]" href="/momo">← Back to conversation</Link>}
      <div
        className={
        embedded
            ? "mx-auto flex max-w-3xl flex-col gap-4 rounded-[1.5rem] border border-white/80 bg-white/80 p-4 shadow-[0_12px_28px_-18px_rgba(121,88,65,0.25),inset_0_2px_4px_rgba(255,255,255,0.8)] sm:flex-row sm:items-center sm:justify-between"
            : "flex w-full max-w-md flex-col items-center rounded-[2.5rem] border border-white/80 bg-white/80 p-8 shadow-[0_20px_40px_-20px_rgba(121,88,65,0.24),inset_0_2px_4px_rgba(255,255,255,0.8)]"
        }
      >
        <div className={embedded ? "flex items-center gap-4" : "flex flex-col items-center"}>
          <div className={embedded ? "relative flex h-16 w-16 items-center justify-center" : "relative mb-12 flex h-48 w-48 items-center justify-center"}>
            <div
              className={`absolute inset-0 rounded-full bg-[#abcebf] ${isPulseActive ? "animate-ping" : ""}`}
              style={{ opacity: isPulseActive ? 0.6 : 0.2 }}
            />
            <MomoPortrait className={embedded ? "relative z-10 size-12" : "relative z-10 size-40"} />
          </div>

          <div className={embedded ? "" : "text-center"}>
            <p className="font-['Plus_Jakarta_Sans'] text-xs font-medium uppercase tracking-[0.12em] text-[#4a6b5e]/70">
              Momo Voice
            </p>
            <h2 className={embedded ? "mt-1 font-['Plus_Jakarta_Sans'] text-lg font-medium text-[#325347]" : "mb-4 mt-2 text-center text-3xl font-medium tracking-[-0.03em] text-[#325347]"}>
              Talk to Momo
            </h2>
            <p className={`font-['Plus_Jakarta_Sans'] text-sm ${callState === "ERROR" ? "text-[#ba1a1a]" : "text-[#414845]"}`}>
              {isCallable ? statusText : "Create or select a chat before calling."}
            </p>
          </div>
        </div>

        {callState === "IDLE" || callState === "DISCONNECTED" || callState === "ERROR" ? (
          <button
            className={embedded ? "rounded-full bg-[#325347] px-5 py-3 font-['Plus_Jakarta_Sans'] text-sm font-medium text-white shadow-[0_8px_16px_-6px_rgba(50,83,71,0.3),inset_0_1px_0_rgba(255,255,255,0.4)] transition-all hover:bg-[#4a6b5e] active:scale-95 disabled:pointer-events-none disabled:opacity-50" : "w-full rounded-full bg-[#325347] py-4 text-lg font-medium text-white shadow-[0_8px_16px_-6px_rgba(50,83,71,0.3),inset_0_1px_0_rgba(255,255,255,0.4)] transition-all hover:bg-[#4a6b5e] active:scale-95 disabled:pointer-events-none disabled:opacity-50"}
            disabled={!isCallable}
            onClick={startCall}
          >
            Start Rant
          </button>
        ) : (
          <button
            className={embedded ? "rounded-full bg-[#ffdad6] px-5 py-3 font-['Plus_Jakarta_Sans'] text-sm font-medium text-[#93000a] shadow-[0_8px_16px_-6px_rgba(186,26,26,0.2),inset_0_1px_0_rgba(255,255,255,0.55)] transition-all hover:bg-[#ffb4ab] active:scale-95" : "w-full rounded-full bg-[#ffdad6] py-4 text-lg font-medium text-[#93000a] shadow-[0_8px_16px_-6px_rgba(186,26,26,0.2),inset_0_1px_0_rgba(255,255,255,0.55)] transition-all hover:bg-[#ffb4ab] active:scale-95"}
            onClick={endCall}
          >
            End Rant
          </button>
        )}
      </div>
    </div>
  );
}
