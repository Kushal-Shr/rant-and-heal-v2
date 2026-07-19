"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Timestamp } from "firebase/firestore";
import { Button } from "@/src/components/ui/Button";
import { Spinner } from "@/src/components/ui/Spinner";
import { Textarea } from "@/src/components/forms/Textarea";
import { useAuth } from "@/src/context/AuthContext";
import { createCallSession, observeOpenCallSessions } from "@/src/services/therapyCallService";
import { observeTherapyMessages, sendTherapyMessage } from "@/src/services/therapyMessageService";
import {
  TherapyCallSession,
  TherapyMessage,
  TherapyMessageSenderRole,
} from "@/src/types/database";

interface TherapyChatRoomProps {
  patientUid: string;
  senderRole: TherapyMessageSenderRole;
  title: string;
  subtitle: string;
  backHref: string;
  callHrefForSession: (sessionId: string) => string;
  therapistUid: string;
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
  patientUid,
  senderRole,
  subtitle,
  therapistUid,
  title,
}: TherapyChatRoomProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<TherapyMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isStartingCall, setIsStartingCall] = useState(false);
  const [openCall, setOpenCall] = useState<TherapyCallSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return observeTherapyMessages(
      patientUid,
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
  }, [patientUid]);

  useEffect(() => {
    return observeOpenCallSessions(
      patientUid,
      (sessions) => {
        setOpenCall(sessions[0] ?? null);
      },
      (snapshotError) => {
        console.error("Failed to observe therapy calls:", snapshotError);
      }
    );
  }, [patientUid]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!inputValue.trim()) {
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      await sendTherapyMessage(patientUid, inputValue, senderRole);
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
      const sessionId = await createCallSession(patientUid, therapistUid);
      window.location.href = callHrefForSession(sessionId);
    } catch (callError) {
      console.error("Failed to start therapy call:", callError);
      setError(callError instanceof Error ? callError.message : "Could not start the call.");
    } finally {
      setIsStartingCall(false);
    }
  }

  const callActionHref = openCall?.id ? callHrefForSession(openCall.id) : null;
  const callStartedByMe = openCall?.startedBy === user?.uid;

  return (
    <div className="flex min-h-[calc(100vh-3rem)] flex-col border-2 border-[#2c1601] bg-[#fff8f5] font-['Plus_Jakarta_Sans'] text-[#2c1601] shadow-[8px_8px_0_#abcebf]">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-[#2c1601] bg-white p-5">
        <div>
          <Link className="text-sm font-black text-[#4a6b5e] underline" href={backHref}>
            Back
          </Link>
          <h1 className="mt-2 text-2xl font-black">{title}</h1>
          <p className="text-sm font-bold text-[#4a6b5e]">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {callActionHref ? (
            <Link
              className="border-2 border-[#2c1601] bg-[#abcebf] px-5 py-3 font-black shadow-[4px_4px_0_#2c1601]"
              href={callActionHref}
            >
              {callStartedByMe ? "Return to call" : "Join call"}
            </Link>
          ) : (
            <Button
              className="rounded-none border-2 border-[#2c1601] shadow-[4px_4px_0_#2c1601]"
              isLoading={isStartingCall}
              onClick={handleStartCall}
            >
              Start call
            </Button>
          )}
        </div>
      </header>

      {openCall ? (
        <section className="border-b-2 border-[#2c1601] bg-[#ffd86b] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black uppercase">{callStartedByMe ? "You started a call" : "Incoming call"}</p>
              <p className="text-sm font-bold text-[#4a6b5e]">Status: {openCall.status}</p>
            </div>
            {callActionHref ? (
              <Link
                className="border-2 border-[#2c1601] bg-white px-4 py-2 font-black shadow-[3px_3px_0_#2c1601]"
                href={callActionHref}
              >
                {callStartedByMe ? "Return" : "Join"}
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      <main className="flex-1 overflow-y-auto p-5">
        {isLoading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Spinner label="Loading chat" />
          </div>
        ) : messages.length === 0 ? (
          <div className="border-2 border-[#2c1601] bg-[#e1d4ff] p-5 font-bold">
            No messages yet.
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
                    className={`max-w-[78%] border-2 border-[#2c1601] p-4 shadow-[4px_4px_0_#2c1601] ${
                      isMine ? "bg-[#abcebf]" : "bg-white"
                    }`}
                  >
                    <p className="whitespace-pre-wrap text-sm leading-6">{message.text}</p>
                    <p className="mt-2 text-xs font-black uppercase text-[#4a6b5e]">
                      {isMine ? "You" : message.senderRole === TherapyMessageSenderRole.THERAPIST ? "Therapist" : "Patient"} · {formatMessageTime(message)}
                    </p>
                  </div>
                </article>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </main>

      <form className="border-t-2 border-[#2c1601] bg-white p-4" onSubmit={handleSubmit}>
        {error ? <p className="mb-3 border-2 border-[#2c1601] bg-[#ffdad6] p-3 text-sm font-bold">{error}</p> : null}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Textarea
            className="min-h-16 flex-1 rounded-none border-2 border-[#2c1601] bg-[#fff8f5] p-4 shadow-none"
            onChange={(event) => setInputValue(event.target.value)}
            placeholder="Type a message..."
            rows={2}
            value={inputValue}
          />
          <Button
            className="rounded-none border-2 border-[#2c1601] shadow-[4px_4px_0_#2c1601]"
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
