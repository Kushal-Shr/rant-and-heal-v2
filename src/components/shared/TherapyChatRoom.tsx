"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Timestamp } from "firebase/firestore";
import { Button } from "@/src/components/ui/Button";
import { Spinner } from "@/src/components/ui/Spinner";
import { Textarea } from "@/src/components/forms/Textarea";
import { useAuth } from "@/src/context/AuthContext";
import {
  createCallSession,
  declineCallSession,
  endCallSession,
  observeOpenCallSessions,
} from "@/src/services/therapyCallService";
import { observeTherapyMessages, sendTherapyMessage } from "@/src/services/therapyMessageService";
import {
  TherapyCallSession,
  TherapyMessage,
  TherapyMessageSenderRole,
} from "@/src/types/database";

interface TherapyChatRoomProps {
  relationshipId: string;
  senderRole: TherapyMessageSenderRole;
  title: string;
  subtitle: string;
  backHref: string;
  callHrefForSession: (sessionId: string) => string;
}

function formatMessageTime(message: TherapyMessage) {
  if (message.createdAt instanceof Timestamp) {
    return message.createdAt.toDate().toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return "Sending";
}

export function TherapyChatRoom({
  backHref,
  callHrefForSession,
  relationshipId,
  senderRole,
  subtitle,
  title,
}: TherapyChatRoomProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<TherapyMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isStartingCall, setIsStartingCall] = useState(false);
  const [isUpdatingCall, setIsUpdatingCall] = useState(false);
  const [openCall, setOpenCall] = useState<TherapyCallSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return observeTherapyMessages(
      relationshipId,
      (nextMessages) => {
        setMessages(nextMessages);
        setIsLoading(false);
      },
      (snapshotError) => {
        console.error("Failed to observe therapy messages:", snapshotError);
        setError("Could not load this therapy chat.");
        setIsLoading(false);
      }
    );
  }, [relationshipId]);

  useEffect(() => {
    if (!user?.uid) {
      return;
    }

    return observeOpenCallSessions(
      relationshipId,
      user.uid,
      senderRole,
      (sessions) => {
        const nextCall =
          sessions.find((session) => session.status === "ACTIVE") ??
          sessions.find((session) => session.recipientId === user?.uid) ??
          sessions.find((session) => session.callerId === user?.uid) ??
          null;
        setOpenCall(nextCall);
      },
      (snapshotError) => {
        console.error("Failed to observe therapy calls:", snapshotError);
      }
    );
  }, [relationshipId, senderRole, user?.uid]);

  useEffect(() => {
    const container = messagesRef.current;
    if (container) container.scrollTo({ top: container.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [messages]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!inputValue.trim()) {
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      await sendTherapyMessage(relationshipId, inputValue, senderRole);
      setInputValue("");
    } catch (sendError) {
      console.error("Failed to send therapy message:", sendError);
      setError(sendError instanceof Error ? sendError.message : "Could not send that message.");
    } finally {
      setIsSending(false);
    }
  }

  async function handleStartCall() {
    setIsStartingCall(true);
    setError(null);

    try {
      const sessionId = await createCallSession(relationshipId);
      window.location.href = callHrefForSession(sessionId);
    } catch (callError) {
      console.error("Failed to start therapy call:", callError);
      setError(callError instanceof Error ? callError.message : "Could not start the call.");
    } finally {
      setIsStartingCall(false);
    }
  }

  async function handleDeclineCall() {
    if (!openCall?.id) {
      return;
    }

    setIsUpdatingCall(true);
    setError(null);

    try {
      await declineCallSession(relationshipId, openCall.id);
    } catch (callError) {
      console.error("Failed to decline therapy call:", callError);
      setError(callError instanceof Error ? callError.message : "Could not decline the call.");
    } finally {
      setIsUpdatingCall(false);
    }
  }

  async function handleEndCall() {
    if (!openCall?.id) {
      return;
    }

    setIsUpdatingCall(true);
    setError(null);

    try {
      await endCallSession(relationshipId, openCall.id);
    } catch (callError) {
      console.error("Failed to end therapy call:", callError);
      setError(callError instanceof Error ? callError.message : "Could not end the call.");
    } finally {
      setIsUpdatingCall(false);
    }
  }

  const callActionHref = openCall?.id ? callHrefForSession(openCall.id) : null;
  const callStartedByMe = openCall?.callerId === user?.uid;
  const isIncomingCall = openCall?.status === "RINGING" && openCall.recipientId === user?.uid;
  const callInProgress = openCall?.status === "ACTIVE";
  const callActionLabel = callInProgress || callStartedByMe ? "Return to call" : "Join call";

  return (
    <div className="flex h-[calc(100dvh-7rem)] min-h-[36rem] md:h-[calc(100dvh-4rem)] flex-col overflow-hidden rounded-[2.5rem] border border-white/80 bg-white/70 font-['Plus_Jakarta_Sans'] text-[#2c1601] shadow-[0_24px_48px_-24px_rgba(121,88,65,0.24),inset_0_2px_4px_rgba(255,255,255,0.85)]">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-[#ffeada] bg-[#fff8f5]/80 p-5 sm:p-6">
        <div>
          <Link className="inline-flex items-center gap-1 rounded-full bg-[#fff1e8] px-3 py-1.5 text-sm font-medium text-[#325347] transition hover:bg-[#ffe3cd]" href={backHref}>
            <span aria-hidden="true" className="material-symbols-outlined text-base">arrow_back</span> Back
          </Link>
          <h1 className="mt-3 text-2xl font-medium tracking-[-0.02em] text-[#325347]">{title}</h1>
          <p className="mt-1 text-sm font-light text-[#4a6b5e]">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {callActionHref ? (
            <Link
              className="rounded-full bg-[#c6ebda] px-5 py-3 text-sm font-medium text-[#325347] shadow-[0_8px_16px_-6px_rgba(50,83,71,0.2),inset_0_1px_3px_rgba(255,255,255,0.8)] transition hover:bg-[#abcebf] active:scale-95"
              href={callActionHref}
            >
              {callActionLabel}
            </Link>
          ) : (
            <Button
              isLoading={isStartingCall}
              onClick={handleStartCall}
            >
              Start call
            </Button>
          )}
        </div>
      </header>

      {openCall ? (
        <section className="border-b border-[#ffeada] bg-[#ffe3cd]/75 p-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#795841]">
                {callInProgress ? "Call in progress" : callStartedByMe ? "You started a call" : "Incoming call"}
              </p>
              <p className="mt-1 text-sm font-light text-[#795841]">Status: {openCall.status.toLowerCase()}</p>
            </div>
            {callActionHref ? (
              <Link
                className="rounded-full bg-white/85 px-4 py-2 text-sm font-medium text-[#795841] shadow-sm transition hover:bg-white"
                href={callActionHref}
              >
                {callInProgress || callStartedByMe ? "Return" : "Join"}
              </Link>
            ) : null}
            {isIncomingCall ? (
              <Button
                className="px-4 py-2"
                isLoading={isUpdatingCall}
                onClick={handleDeclineCall}
                variant="danger"
              >
                Decline
              </Button>
            ) : null}
            {callStartedByMe || callInProgress ? (
              <Button
                className="px-4 py-2"
                isLoading={isUpdatingCall}
                onClick={handleEndCall}
                variant="danger"
              >
                {callInProgress ? "End call" : "Cancel call"}
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      <div ref={messagesRef} className="min-h-0 flex-1 overflow-y-auto bg-[#fff8f5]/45 p-5 sm:p-6">
        {isLoading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Spinner label="Loading chat" />
          </div>
        ) : messages.length === 0 ? (
          <div className="mx-auto flex max-w-md flex-col items-center rounded-[2rem] bg-[#fff1e8] p-7 text-center shadow-[inset_0_3px_8px_rgba(44,22,1,0.04)]">
            <span aria-hidden="true" className="material-symbols-outlined text-3xl text-[#4a6b5e]/65">waving_hand</span>
            <p className="mt-3 text-sm font-light leading-6 text-[#414845]">No messages yet. A gentle hello is enough to begin.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => {
              const isMine = message.senderId === user?.uid;

              return (
                <article
                  className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                  key={message.id}
                >
                  <div
                    className={`max-w-[78%] rounded-2xl p-4 shadow-[0_10px_20px_-14px_rgba(44,22,1,0.24)] ${
                      isMine ? "rounded-br-md bg-[#c6ebda]/70 text-[#2d4d41]" : "rounded-bl-md bg-white text-[#2c1601]"
                    }`}
                  >
                    <p className="whitespace-pre-wrap text-sm leading-6">{message.text}</p>
                    <p className="mt-2 text-xs font-medium text-[#4a6b5e]/75">
                      {isMine ? "You" : message.senderRole === TherapyMessageSenderRole.THERAPIST ? "Therapist" : "Patient"} · {formatMessageTime(message)}
                    </p>
                  </div>
                </article>
              );
            })}

          </div>
        )}
      </div>

      <form className="shrink-0 border-t border-[#ffeada] bg-white/85 p-4 sm:p-5" onSubmit={handleSubmit}>
        {error ? <p className="mb-3 rounded-[1rem] bg-[#ffdad6] p-3 text-sm text-[#93000a]">{error}</p> : null}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Textarea
            aria-label="Message"
            className="min-h-16 flex-1 rounded-[1.5rem] bg-[#fff1e8] p-4 shadow-[inset_0_3px_8px_rgba(44,22,1,0.04)]"
            onChange={(event) => setInputValue(event.target.value)}
            placeholder="Type a message..."
            rows={2}
            value={inputValue}
          />
          <Button
            isLoading={isSending}
            type="submit"
          >
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}
