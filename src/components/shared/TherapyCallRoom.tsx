"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/src/components/ui/Button";
import { Spinner } from "@/src/components/ui/Spinner";
import { useAuth } from "@/src/context/AuthContext";
import {
  endCallSession,
  markCallSessionActive,
  observeCallSession,
  observeSignals,
  sendSignal,
} from "@/src/services/therapyCallService";
import { TherapyCallSignal, TherapyCallStatus } from "@/src/types/database";

interface TherapyCallRoomProps {
  patientUid: string;
  sessionId: string;
  backHref: string;
}

const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export function TherapyCallRoom({ backHref, patientUid, sessionId }: TherapyCallRoomProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<"waiting" | "connecting" | "connected" | "ended" | "failed">("waiting");
  const [error, setError] = useState<string | null>(null);
  const [sessionStartedBy, setSessionStartedBy] = useState<string | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const peerInitPromiseRef = useRef<Promise<RTCPeerConnection> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const processedSignalIdsRef = useRef<Set<string>>(new Set());
  const hasOfferedRef = useRef(false);
  const hasAnsweredRef = useRef(false);
  const isClosedRef = useRef(false);

  const cleanup = useCallback(() => {
    isClosedRef.current = true;
    peerRef.current?.close();
    peerRef.current = null;
    peerInitPromiseRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }, []);

  const createPeer = useCallback(async () => {
    isClosedRef.current = false;
    const peer = new RTCPeerConnection(rtcConfig);
    peerRef.current = peer;

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        void sendSignal(patientUid, sessionId, {
          type: "ice-candidate",
          payload: event.candidate.toJSON() as Record<string, unknown>,
        });
      }
    };

    peer.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
      setStatus("connected");
      void markCallSessionActive(patientUid, sessionId);
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") {
        setStatus("connected");
      }
      if (peer.connectionState === "failed" || peer.connectionState === "disconnected") {
        setStatus("failed");
      }
    };

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    if (isClosedRef.current || peer.signalingState === "closed") {
      stream.getTracks().forEach((track) => track.stop());
      return peer;
    }

    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));

    return peer;
  }, [patientUid, sessionId]);

  const ensurePeer = useCallback(async () => {
    if (peerRef.current && peerRef.current.signalingState !== "closed") {
      return peerRef.current;
    }

    if (peerInitPromiseRef.current) {
      return peerInitPromiseRef.current;
    }

    peerInitPromiseRef.current = createPeer();
    return peerInitPromiseRef.current;
  }, [createPeer]);

  useEffect(() => cleanup, [cleanup]);

  useEffect(() => {
    return observeCallSession(
      patientUid,
      sessionId,
      (session) => {
        if (!session) {
          setError("This call session could not be found.");
          setStatus("failed");
          return;
        }
        setSessionStartedBy(session.startedBy);
        if (session.status === TherapyCallStatus.ENDED) {
          setStatus("ended");
          cleanup();
        }
      },
      (snapshotError) => {
        console.error("Failed to observe therapy call:", snapshotError);
        setError("Could not load this call.");
        setStatus("failed");
      }
    );
  }, [cleanup, patientUid, sessionId]);

  const handleSignal = useCallback(async (signal: TherapyCallSignal, peer: RTCPeerConnection, isStarter: boolean) => {
    if (signal.type === "hangup") {
      setStatus("ended");
      cleanup();
      return;
    }

    if (signal.type === "offer" && !isStarter && !hasAnsweredRef.current) {
      hasAnsweredRef.current = true;
      await peer.setRemoteDescription(new RTCSessionDescription(signal.payload as unknown as RTCSessionDescriptionInit));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await sendSignal(patientUid, sessionId, {
        type: "answer",
        payload: answer as unknown as Record<string, unknown>,
      });
      return;
    }

    if (signal.type === "answer" && isStarter && peer.signalingState !== "stable") {
      await peer.setRemoteDescription(new RTCSessionDescription(signal.payload as unknown as RTCSessionDescriptionInit));
      return;
    }

    if (signal.type === "ice-candidate") {
      await peer.addIceCandidate(new RTCIceCandidate(signal.payload as RTCIceCandidateInit));
    }
  }, [cleanup, patientUid, sessionId]);

  useEffect(() => {
    if (!user?.uid || !sessionStartedBy) {
      return;
    }

    let cancelled = false;
    const isStarter = user.uid === sessionStartedBy;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      if (isClosedRef.current) {
        return;
      }

      setStatus("connecting");
      void ensurePeer()
        .then(async (peer) => {
          if (cancelled || peer.signalingState === "closed") {
            return;
          }

          if (isStarter && !hasOfferedRef.current) {
            hasOfferedRef.current = true;
            const offer = await peer.createOffer();
            await peer.setLocalDescription(offer);
            await sendSignal(patientUid, sessionId, {
              type: "offer",
              payload: offer as unknown as Record<string, unknown>,
            });
          }
        })
        .catch((mediaError) => {
          console.error("Could not access camera or microphone:", mediaError);
          setError("Could not access your camera or microphone.");
          setStatus("failed");
        });
    });

    const unsubscribe = observeSignals(
      patientUid,
      sessionId,
      (signals) => {
        if (isClosedRef.current) {
          return;
        }

        void ensurePeer().then(async (peer) => {
          if (cancelled || peer.signalingState === "closed") {
            return;
          }

          for (const signal of signals) {
            if (!signal.id || processedSignalIdsRef.current.has(signal.id) || signal.senderId === user.uid) {
              continue;
            }

            processedSignalIdsRef.current.add(signal.id);
            await handleSignal(signal, peer, isStarter);
          }
        }).catch((signalError) => {
          if (cancelled) {
            return;
          }

          console.error("Failed to handle call signals:", signalError);
          setError("Call signaling failed.");
          setStatus("failed");
        });
      },
      (signalError) => {
        console.error("Failed to observe call signals:", signalError);
        setError("Call signaling failed.");
        setStatus("failed");
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [ensurePeer, handleSignal, patientUid, sessionId, sessionStartedBy, user?.uid]);

  async function handleHangup() {
    setStatus("ended");
    cleanup();

    try {
      await endCallSession(patientUid, sessionId);
    } catch (hangupError) {
      console.error("Failed to end call:", hangupError);
    }

    router.push(backHref);
  }

  return (
    <div className="min-h-[calc(100vh-3rem)] border-2 border-[#2c1601] bg-[#111814] font-['Plus_Jakarta_Sans'] text-white shadow-[8px_8px_0_#abcebf]">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-[#2c1601] bg-[#fff8f5] p-5 text-[#2c1601]">
        <div>
          <Link className="text-sm font-black text-[#4a6b5e] underline" href={backHref}>
            Back
          </Link>
          <h1 className="mt-2 text-2xl font-black">Therapy call</h1>
          <p className="text-sm font-bold capitalize text-[#4a6b5e]">{status}</p>
        </div>
        <Button className="rounded-none border-2 border-[#2c1601] shadow-[4px_4px_0_#2c1601]" onClick={handleHangup} variant="danger">
          End call
        </Button>
      </header>

      {error ? <p className="m-5 border-2 border-[#2c1601] bg-[#ffdad6] p-4 font-bold text-[#93000a]">{error}</p> : null}

      <main className="grid min-h-[68vh] gap-4 p-5 lg:grid-cols-[1fr_320px]">
        <section className="relative min-h-[48vh] overflow-hidden border-2 border-white/30 bg-black">
          <video ref={remoteVideoRef} autoPlay className="h-full min-h-[48vh] w-full object-cover" playsInline />
          {status !== "connected" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70">
              <div className="text-center">
                <Spinner label="Connecting call" />
                <p className="mt-4 font-black capitalize">{status}</p>
              </div>
            </div>
          ) : null}
        </section>
        <aside className="space-y-4">
          <video ref={localVideoRef} autoPlay className="aspect-video w-full border-2 border-white/30 bg-black object-cover" muted playsInline />
          <div className="border-2 border-white/30 bg-white/10 p-4 text-sm leading-6">
            Use your browser camera and microphone permissions to join. Calls use Firestore signaling and a Google STUN server for this MVP.
          </div>
        </aside>
      </main>
    </div>
  );
}
