"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/src/components/ui/Button";
import { Spinner } from "@/src/components/ui/Spinner";
import { useAuth } from "@/src/context/AuthContext";
import {
  answerCallSession,
  endCallSession,
  getCallIceServers,
  observeCallSession,
  observeSignals,
  sendSignal,
} from "@/src/services/therapyCallService";
import {
  TherapyCallSession,
  TherapyCallSignal,
  TherapyCallStatus,
} from "@/src/types/database";
import { TherapyNotesPanel } from "./TherapyNotesPanel";
import { setCallMediaEnabled } from "@/src/lib/therapy/mediaControls";

interface TherapyCallRoomProps {
  relationshipId: string;
  sessionId: string;
  backHref: string;
}

export function TherapyCallRoom({ backHref, relationshipId, sessionId }: TherapyCallRoomProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<"waiting" | "connecting" | "connected" | "ended" | "failed">("waiting");
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<TherapyCallSession | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const mediaPreferencesRef = useRef({ audio: true, video: true });
  const mediaGenerationRef = useRef(0);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const peerInitPromiseRef = useRef<Promise<RTCPeerConnection> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const processedSignalIdsRef = useRef<Set<string>>(new Set());
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const hasOfferedRef = useRef(false);
  const hasAnsweredRef = useRef(false);
  const isAnsweringRef = useRef(false);
  const isClosedRef = useRef(false);

  const cleanup = useCallback(() => {
    mediaGenerationRef.current += 1;
    isClosedRef.current = true;
    peerRef.current?.close();
    peerRef.current = null;
    peerInitPromiseRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  }, []);

  const createPeer = useCallback(async () => {
    isClosedRef.current = false;
    const generation = mediaGenerationRef.current;
    const iceServers = await getCallIceServers(relationshipId, sessionId);
    if (isClosedRef.current || generation !== mediaGenerationRef.current) throw new Error("Call closed.");
    const peer = new RTCPeerConnection({ iceServers });
    peerRef.current = peer;

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        void sendSignal(relationshipId, sessionId, {
          type: "ice-candidate",
          payload: event.candidate.toJSON() as Record<string, unknown>,
        });
      }
    };
    peer.ontrack = (event) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") setStatus("connected");
      if (peer.connectionState === "disconnected") setStatus("connecting");
      if (peer.connectionState === "failed") {
        cleanup();
        setError("The connection was lost. Return to messages to start a new call.");
        setStatus("failed");
      }
    };

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    if (isClosedRef.current || generation !== mediaGenerationRef.current || peer.signalingState === "closed") {
      stream.getTracks().forEach((track) => track.stop());
      return peer;
    }

    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    stream.getTracks().forEach((track) => {
      track.enabled = track.kind === "audio" ? mediaPreferencesRef.current.audio : mediaPreferencesRef.current.video;
      peer.addTrack(track, stream);
    });
    return peer;
  }, [cleanup, relationshipId, sessionId]);

  const ensurePeer = useCallback(async () => {
    if (peerInitPromiseRef.current) return peerInitPromiseRef.current;
    if (peerRef.current && peerRef.current.signalingState !== "closed") return peerRef.current;
    peerInitPromiseRef.current = createPeer();
    return peerInitPromiseRef.current;
  }, [createPeer]);

  const addIceCandidate = useCallback(async (peer: RTCPeerConnection, candidate: RTCIceCandidateInit) => {
    if (!peer.remoteDescription) {
      pendingIceCandidatesRef.current.push(candidate);
      return;
    }
    await peer.addIceCandidate(new RTCIceCandidate(candidate));
  }, []);

  const flushPendingIceCandidates = useCallback(async (peer: RTCPeerConnection) => {
    const candidates = pendingIceCandidatesRef.current.splice(0);
    for (const candidate of candidates) await peer.addIceCandidate(new RTCIceCandidate(candidate));
  }, []);

  useEffect(() => cleanup, [cleanup]);

  useEffect(() => observeCallSession(
    relationshipId,
    sessionId,
    (nextSession) => {
      if (!nextSession) {
        cleanup();
        setError("This call session could not be found.");
        setStatus("failed");
        return;
      }
      setSession(nextSession);
      if (nextSession.status === TherapyCallStatus.ENDED || nextSession.status === TherapyCallStatus.DECLINED) {
        setStatus("ended");
        cleanup();
      }
    },
    (snapshotError) => {
      cleanup();
      console.error("Failed to observe therapy call:", snapshotError);
      setError("Could not load this call.");
      setStatus("failed");
    }
  ), [cleanup, relationshipId, sessionId]);

  const handleSignal = useCallback(async (
    signal: TherapyCallSignal,
    peer: RTCPeerConnection,
    isCaller: boolean
  ) => {
    if (signal.type === "hangup") {
      setStatus("ended");
      cleanup();
      return;
    }
    if (signal.type === "offer" && !isCaller && !hasAnsweredRef.current) {
      hasAnsweredRef.current = true;
      await peer.setRemoteDescription(new RTCSessionDescription(signal.payload as unknown as RTCSessionDescriptionInit));
      await flushPendingIceCandidates(peer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await sendSignal(relationshipId, sessionId, { type: "answer", payload: answer as unknown as Record<string, unknown> });
      return;
    }
    if (signal.type === "answer" && isCaller && peer.signalingState !== "stable") {
      await peer.setRemoteDescription(new RTCSessionDescription(signal.payload as unknown as RTCSessionDescriptionInit));
      await flushPendingIceCandidates(peer);
      return;
    }
    if (signal.type === "ice-candidate") {
      await addIceCandidate(peer, signal.payload as RTCIceCandidateInit);
    }
  }, [addIceCandidate, cleanup, flushPendingIceCandidates, relationshipId, sessionId]);

  useEffect(() => {
    if (!user?.uid || !session) return;

    const isCaller = user.uid === session.callerId;
    const isRecipient = user.uid === session.recipientId;
    if (!isCaller && !isRecipient) {
      cleanup();
      queueMicrotask(() => {
        setError("You are not a participant in this call.");
        setStatus("failed");
      });
      return;
    }
    if (session.status === TherapyCallStatus.ENDED || session.status === TherapyCallStatus.DECLINED) return;

    if (session.status === TherapyCallStatus.RINGING && isRecipient) {
      if (!isAnsweringRef.current) {
        isAnsweringRef.current = true;
        void answerCallSession(relationshipId, sessionId).catch((answerError) => {
          console.error("Could not answer therapy call:", answerError);
          setError("Could not join this call.");
          setStatus("failed");
        });
      }
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setStatus("connecting");
      void ensurePeer().then(async (peer) => {
        if (cancelled || peer.signalingState === "closed") return;
        if (isCaller && !hasOfferedRef.current) {
          hasOfferedRef.current = true;
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          await sendSignal(relationshipId, sessionId, { type: "offer", payload: offer as unknown as Record<string, unknown> });
        }
      }).catch((mediaError) => {
        if (cancelled || isClosedRef.current) return;
        console.error("Could not access camera or microphone:", mediaError);
        cleanup();
        setError("Could not access your camera or microphone.");
        setStatus("failed");
      });
    });

    const unsubscribe = observeSignals(
      relationshipId,
      sessionId,
      (signals) => {
        if (isClosedRef.current) return;
        void ensurePeer().then(async (peer) => {
          if (cancelled || peer.signalingState === "closed") return;
          for (const signal of signals) {
            if (!signal.id || processedSignalIdsRef.current.has(signal.id) || signal.senderId === user.uid) continue;
            processedSignalIdsRef.current.add(signal.id);
            await handleSignal(signal, peer, isCaller);
          }
        }).catch((signalError) => {
          if (cancelled) return;
          console.error("Failed to handle call signals:", signalError);
          cleanup();
          setError("Call signaling failed.");
          setStatus("failed");
        });
      },
      (signalError) => {
        console.error("Failed to observe call signals:", signalError);
        cleanup();
        setError("Call signaling failed.");
        setStatus("failed");
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [cleanup, ensurePeer, handleSignal, relationshipId, session, sessionId, user?.uid]);

  function toggleMedia(kind: "audio" | "video") {
    if (isClosedRef.current || status === "ended" || status === "failed") return;
    const enabled = !mediaPreferencesRef.current[kind];
    mediaPreferencesRef.current[kind] = enabled;
    setCallMediaEnabled(localStreamRef.current, kind, enabled);
    if (kind === "audio") setMicEnabled(enabled);
    else setCameraEnabled(enabled);
  }

  async function handleHangup() {
    setStatus("ended");
    cleanup();
    try {
      await endCallSession(relationshipId, sessionId);
      if (user?.uid !== session?.therapistId) router.push(backHref);
    } catch (hangupError) {
      console.error("Failed to end call:", hangupError);
      setError("Could not confirm that the call ended. Return to messages and try again.");
      setStatus("failed");
    }
  }

  const waitingForRecipient = session?.status === TherapyCallStatus.RINGING && session.callerId === user?.uid;
  const callFinished = status === "ended" || status === "failed";

  return (
    <div className="min-h-[calc(100dvh-4rem)] overflow-hidden rounded-[2.5rem] border border-white/70 bg-[#263f36] font-['Plus_Jakarta_Sans'] text-[#ffeee1] shadow-[0_24px_48px_-24px_rgba(74,43,16,0.4)]">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#795841]/35 bg-[#fff8f5] p-5 text-[#2c1601] sm:p-6">
        <div>
          <Link className="inline-flex items-center gap-1 rounded-full bg-[#fff1e8] px-3 py-1.5 text-sm font-medium text-[#325347]" href={backHref}><span aria-hidden="true" className="material-symbols-outlined text-base">arrow_back</span> Back</Link>
          <h1 className="mt-3 text-2xl font-medium text-[#325347]">Therapy call</h1>
          <p className="mt-1 text-sm font-light capitalize text-[#4a6b5e]">
            {waitingForRecipient ? "Waiting for the other participant" : status}
          </p>
        </div>
          <div aria-label="Call controls" className="flex flex-wrap items-center gap-2">
            <button aria-label={micEnabled ? "Mute microphone" : "Unmute microphone"} aria-pressed={!micEnabled} disabled={callFinished} onClick={() => toggleMedia("audio")} type="button" className={`flex min-h-11 items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-medium transition disabled:opacity-40 ${micEnabled ? "bg-[#e7efe4] text-[#325347] hover:bg-[#d4e5ce]" : "bg-[#ffdad6] text-[#93000a]"}`}><span aria-hidden="true" className="material-symbols-outlined">{micEnabled ? "mic" : "mic_off"}</span>{micEnabled ? "Mute" : "Unmute"}</button>
            <button aria-label={cameraEnabled ? "Turn camera off" : "Turn camera on"} aria-pressed={!cameraEnabled} disabled={callFinished} onClick={() => toggleMedia("video")} type="button" className={`flex min-h-11 items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-medium transition disabled:opacity-40 ${cameraEnabled ? "bg-[#e7efe4] text-[#325347] hover:bg-[#d4e5ce]" : "bg-[#ffdad6] text-[#93000a]"}`}><span aria-hidden="true" className="material-symbols-outlined">{cameraEnabled ? "videocam" : "videocam_off"}</span>{cameraEnabled ? "Camera off" : "Camera on"}</button>
        <Button disabled={status === "ended"} onClick={handleHangup} variant="danger">
          <span aria-hidden="true" className="material-symbols-outlined !text-lg">call_end</span>
          End call
        </Button>
          </div>
      </header>

      {error ? <p role="alert" className="m-5 rounded-[1.5rem] bg-[#ffdad6] p-4 text-sm text-[#93000a]">{error}</p> : null}

      {status === "ended" && user?.uid === session?.therapistId ? <div className="m-5"><TherapyNotesPanel relationshipId={relationshipId} isTherapist callId={sessionId} /></div> : null}

      <div className="grid min-h-[68vh] gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="relative min-h-[48vh] overflow-hidden rounded-[2rem] border border-white/20 bg-[#183026] shadow-[inset_0_2px_8px_rgba(0,0,0,0.3)]">
          <video aria-label="Other participant" ref={remoteVideoRef} autoPlay className="h-full min-h-[48vh] w-full object-contain" playsInline />
          {status !== "connected" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70">
              <div className="px-6 text-center" role="status">
                {callFinished ? <span aria-hidden="true" className="material-symbols-outlined !text-4xl">{status === "ended" ? "call_end" : "wifi_off"}</span> : <Spinner label="Connecting call" />}
                <p className="mt-4 font-medium">{status === "ended" ? "Your call has ended" : status === "failed" ? "We couldn’t connect your call" : waitingForRecipient ? "Waiting for the other participant" : "Connecting you…"}</p>
                {callFinished ? <Link className="mt-5 inline-flex min-h-11 items-center rounded-full bg-[#c6ebda] px-5 text-sm font-medium text-[#325347]" href={backHref}>Return to messages</Link> : null}
              </div>
            </div>
          ) : null}
        </section>
        <aside className="space-y-4">
          <div className="relative overflow-hidden rounded-[1.5rem] border border-white/20 bg-[#183026]">
            <video aria-label="Your camera preview" ref={localVideoRef} autoPlay className={`aspect-video w-full -scale-x-100 object-cover ${!cameraEnabled || callFinished ? "invisible" : ""}`} muted playsInline />
            {!cameraEnabled || callFinished ? <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#354a40]"><span aria-hidden="true" className="material-symbols-outlined !text-3xl">videocam_off</span><span className="text-sm">{callFinished ? "Camera stopped" : "Your camera is off"}</span></div> : null}
            <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs">You{!micEnabled ? <span aria-hidden="true" className="material-symbols-outlined !text-sm">mic_off</span> : null}</span>
          </div>
          <div className="rounded-[1.5rem] border border-white/15 bg-white/10 p-4 text-sm font-light leading-6 text-[#ffeee1]/80">
            You can turn your camera and microphone off at any time. For a comfortable conversation, choose a quiet space and use headphones if you have them.
          </div>
        </aside>
      </div>
    </div>
  );
}
