"use client";

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

  const cleanupCallResources = () => {
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
          sender,
          text,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        console.error("MOMO TRANSCRIPT ERROR:", response.status, payload?.error ?? "Failed to save transcript.");
      }
    } catch (error) {
      console.error("MOMO TRANSCRIPT ERROR:", error);
    }
  }

  const startCall = async () => {
    if (!user) {
      return;
    }

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

      await createPlaybackContext();

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
          if (setupTimeoutRef.current) {
            window.clearTimeout(setupTimeoutRef.current);
            setupTimeoutRef.current = null;
          }
          isBackendReadyRef.current = true;
          setCallState("CONNECTED");
          setLiveStatus("ready");
        },
        onAudio: (base64Audio) => {
          streamerRef.current?.playBase64Pcm16(base64Audio);
        },
        onTranscript: (sender, text) => {
          void saveTranscript(sender, text);
        },
        onTurnComplete: () => setLiveStatus("ready"),
        onError: (error) => {
          console.error("Gemini Live error:", error);
          setCallState("ERROR");
          setErrorMessage("Connection lost.");
          cleanupCallResources();
        },
        onClose: (event) => {
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

      const recorder = new AudioRecorder();
      recorderRef.current = recorder;
      await recorder.start((base64Audio) => {
        if (liveClientRef.current && isBackendReadyRef.current) {
          setLiveStatus("listening");
          liveClientRef.current.sendAudio(base64Audio);
        }
      });
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

  const isCallable = Boolean(sessionId) || !embedded;
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
          ? "border-b-4 border-black bg-[#fff6c7] px-4 py-4 sm:px-6"
          : "flex min-h-screen flex-col items-center justify-center bg-[var(--color-brutalBg)] p-6 text-[var(--color-foreground)]"
      }
    >
      <div
        className={
          embedded
            ? "mx-auto flex max-w-4xl flex-col gap-4 rounded-[1.5rem] border-4 border-black bg-white p-4 shadow-[6px_6px_0_0_#000000] sm:flex-row sm:items-center sm:justify-between"
            : "flex w-full max-w-md flex-col items-center rounded-3xl border-4 border-black bg-white p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
        }
      >
        <div className={embedded ? "flex items-center gap-4" : "flex flex-col items-center"}>
          <div className={embedded ? "relative flex h-16 w-16 items-center justify-center" : "relative mb-12 flex h-48 w-48 items-center justify-center"}>
            <div
              className={`absolute inset-0 rounded-full bg-[var(--color-brutalTeal)] ${isPulseActive ? "animate-ping" : ""}`}
              style={{ opacity: isPulseActive ? 0.6 : 0.2 }}
            />
            <div className={embedded ? "relative z-10 flex h-12 w-12 items-center justify-center rounded-full border-4 border-black bg-[var(--color-brutalPurple)] text-sm font-black shadow-[3px_3px_0_0_#000000]" : "relative z-10 flex h-32 w-32 items-center justify-center rounded-full border-4 border-black bg-[var(--color-brutalPurple)] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-transform duration-300 hover:scale-105"}>
              MO
            </div>
          </div>

          <div className={embedded ? "" : "text-center"}>
            <p className="font-['Plus_Jakarta_Sans'] text-xs font-black uppercase tracking-[0.22em] text-[#6f5a48]">
              Momo Voice
            </p>
            <h2 className={embedded ? "mt-1 font-['Plus_Jakarta_Sans'] text-lg font-black uppercase text-[#2c1601]" : "mb-4 mt-2 text-center text-3xl font-black uppercase tracking-tighter"}>
              Talk to Momo
            </h2>
            <p className={`font-['Plus_Jakarta_Sans'] text-sm font-bold ${callState === "ERROR" ? "text-red-600" : "text-[#2c1601]"}`}>
              {isCallable ? statusText : "Create or select a chat before calling."}
            </p>
          </div>
        </div>

        {callState === "IDLE" || callState === "DISCONNECTED" || callState === "ERROR" ? (
          <button
            className={embedded ? "rounded-[1rem] border-4 border-black bg-brutalYellow px-5 py-3 font-['Plus_Jakarta_Sans'] text-sm font-black uppercase tracking-[0.18em] text-black shadow-[5px_5px_0_0_#000000] transition-all hover:translate-y-1 hover:shadow-none disabled:pointer-events-none disabled:opacity-50" : "w-full rounded-xl border-4 border-black bg-[var(--color-brutalYellow)] py-4 text-xl font-black text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-y-1 hover:shadow-[0px_0px_0px_0px_rgba(0,0,0,1)] disabled:pointer-events-none disabled:opacity-50"}
            disabled={!isCallable}
            onClick={startCall}
          >
            Start Rant
          </button>
        ) : (
          <button
            className={embedded ? "rounded-[1rem] border-4 border-black bg-red-500 px-5 py-3 font-['Plus_Jakarta_Sans'] text-sm font-black uppercase tracking-[0.18em] text-white shadow-[5px_5px_0_0_#000000] transition-all hover:translate-y-1 hover:shadow-none" : "w-full rounded-xl border-4 border-black bg-red-500 py-4 text-xl font-black text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-y-1 hover:shadow-[0px_0px_0px_0px_rgba(0,0,0,1)]"}
            onClick={endCall}
          >
            End Rant
          </button>
        )}
      </div>
    </div>
  );
}
