"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type FirestoreError,
  type Timestamp,
} from "firebase/firestore";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/forms/Input";
import { Spinner } from "@/src/components/ui/Spinner";
import { db } from "@/src/config/firebase";
import { useAuth } from "@/src/context/AuthContext";

type MessageSender = "USER" | "MOMO";

interface MomoMessage {
  id: string;
  sender: MessageSender;
  text: string;
  timestamp: Timestamp | null;
}

interface FirestoreMomoMessage {
  sender?: MessageSender;
  text?: string;
  timestamp?: Timestamp | null;
}

interface ChatSession {
  id: string;
  title: string;
}

interface FirestoreSession {
  title?: string;
}

export default function MomoPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MomoMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!user) {
      router.push("/auth/login");
    }
  }, [loading, router, user]);

  useEffect(() => {
    if (!user?.uid) {
      return;
    }

    const sessionsRef = collection(db, "users", user.uid, "sessions");
    const sessionsQuery = query(sessionsRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      sessionsQuery,
      async (snapshot) => {
        const nextSessions = snapshot.docs.map((sessionDoc) => {
          const data = sessionDoc.data() as FirestoreSession;

          return {
            id: sessionDoc.id,
            title: typeof data.title === "string" && data.title.trim() ? data.title : "New Conversation",
          };
        });

        setSessions(nextSessions);

        if (nextSessions.length === 0) {
          try {
            const newSessionRef = await addDoc(sessionsRef, {
              title: "New Conversation",
              createdAt: serverTimestamp(),
            });
            setSessionId(newSessionRef.id);
          } catch (error) {
            console.error("FIRESTORE SESSION INIT ERROR:", error);
          }
          return;
        }

        setSessionId((currentSessionId) => currentSessionId ?? nextSessions[0].id);
      },
      (error) => {
        console.error("FIRESTORE SESSION INIT ERROR:", error);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid || !sessionId) {
      return;
    }

    const messagesRef = collection(db, "users", user.uid, "sessions", sessionId, "messages");
    const messagesQuery = query(messagesRef, orderBy("timestamp", "asc"));

    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const nextMessages = snapshot.docs.map((messageDoc) => {
        const data = messageDoc.data() as FirestoreMomoMessage;

        return {
          id: messageDoc.id,
          sender: (data.sender === "USER" ? "USER" : "MOMO") as MessageSender,
          text: typeof data.text === "string" ? data.text : "",
          timestamp: data.timestamp ?? null,
        };
      });

      setMessages(nextMessages);
    });

    return () => unsubscribe();
  }, [sessionId, user?.uid]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!user?.uid || isSending) {
      return;
    }

    if (!sessionId) {
      console.error("FIRESTORE WRITE ERROR:", "missing-session", "No active chat session available.");
      return;
    }

    const nextMessage = inputValue.trim();
    if (!nextMessage) {
      return;
    }

    setIsSending(true);
    setSendError(null);

    try {
      const userMessageText = nextMessage;
      setInputValue("");

      const idToken = await user.getIdToken();
      const response = await fetch("/api/momo/chat", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.uid,
          sessionId,
          messageText: userMessageText,
        }),
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as { error?: string } | null;
        const message = errorPayload?.error ?? "Failed to generate Momo response.";
        console.error(
          "MOMO API ERROR:",
          response.status,
          message
        );
        setInputValue(userMessageText);
        setSendError(message);
      }
    } catch (error) {
      const appError = error as FirestoreError;
      console.error("MOMO SEND ERROR:", appError.code, appError.message);
      setInputValue(nextMessage);
      setSendError(appError.message ?? "Could not send your message.");
    } finally {
      setIsSending(false);
    }
  }

  async function createNewSession() {
    if (!user?.uid) {
      return;
    }

    try {
      const newSessionRef = await addDoc(collection(db, "users", user.uid, "sessions"), {
        title: "New Conversation",
        createdAt: serverTimestamp(),
      });
      setSessionId(newSessionRef.id);
    } catch (error) {
      const firestoreError = error as FirestoreError;
      console.error("FIRESTORE SESSION INIT ERROR:", firestoreError.code, firestoreError.message);
    }
  }

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-3rem)] items-center justify-center bg-brutalBg">
        <Spinner size="lg" label="Loading Momo..." />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex h-[calc(100vh-theme(spacing.12))] w-full overflow-hidden rounded-[2rem] border-4 border-black bg-brutalBg shadow-[12px_12px_0_0_#000000]">
      <aside className="flex w-80 shrink-0 flex-col overflow-hidden border-r-4 border-black bg-[#ffeada]">
        <div className="border-b-4 border-black p-5">
          <Button
            className="w-full rounded-[1.5rem] border-4 border-black bg-brutalYellow px-6 py-5 text-base font-black uppercase tracking-[0.22em] text-black shadow-[8px_8px_0_0_#000000] hover:bg-[#ffd24d]"
            onClick={createNewSession}
          >
            New Chat
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {sessions.map((session) => {
            const isActive = session.id === sessionId;

            return (
              <button
                key={session.id}
                className={`block w-full border-b-4 border-black px-5 py-4 text-left transition-colors ${
                  isActive
                    ? "bg-brutalYellow text-black shadow-[inset_-6px_0_0_#000000]"
                    : "bg-transparent text-[#2c1601] hover:bg-white/60"
                }`}
                onClick={() => setSessionId(session.id)}
                type="button"
              >
                <p className="font-['Plus_Jakarta_Sans'] text-xs font-black uppercase tracking-[0.22em]">
                  Session
                </p>
                <p className="mt-2 truncate font-['Plus_Jakarta_Sans'] text-sm font-bold uppercase tracking-[0.08em]">
                  {session.title}
                </p>
              </button>
            );
          })}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b-4 border-black bg-[#ffeada] px-6 py-5">
          <p className="font-['Plus_Jakarta_Sans'] text-xs font-black uppercase tracking-[0.28em] text-[#6f5a48]">
            Patient Momo Chat
          </p>
          <h1 className="mt-2 font-['Plus_Jakarta_Sans'] text-2xl font-black uppercase text-[#2c1601]">
            Talk It Out With Momo
          </h1>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="mx-auto flex max-w-4xl flex-col gap-4 pb-32">
            {messages.length === 0 ? (
              <div className="rounded-[1.75rem] border-4 border-dashed border-[#2c1601] bg-white px-6 py-8 text-center shadow-[8px_8px_0_0_#2c1601]">
                <p className="font-['Plus_Jakarta_Sans'] text-sm font-black uppercase tracking-[0.24em] text-[#6f5a48]">
                  No messages yet
                </p>
                <p className="mt-3 font-['Plus_Jakarta_Sans'] text-base font-medium text-[#2c1601]">
                  Send the first message to start your conversation with Momo.
                </p>
              </div>
            ) : null}

            {messages.map((message) => {
              const isUserMessage = message.sender === "USER";

              return (
                <div key={message.id} className={`flex ${isUserMessage ? "justify-end" : "justify-start"}`}>
                  <article
                    className={`max-w-[85%] border-4 px-5 py-4 shadow-[6px_6px_0_0_#2c1601] ${
                      isUserMessage
                        ? "bg-brutalTeal text-[#15352b]"
                        : "bg-brutalPurple text-[#352055]"
                    }`}
                  >
                    <p className="font-['Plus_Jakarta_Sans'] text-xs font-black uppercase tracking-[0.2em]">
                      {isUserMessage ? "You" : "Momo"}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap font-['Plus_Jakarta_Sans'] text-base font-medium leading-7">
                      {message.text}
                    </p>
                  </article>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        </main>

        <div className="border-t-4 border-black bg-[#ffeada] px-4 py-4 sm:px-6">
          {sendError ? (
            <div className="mx-auto mb-3 max-w-4xl rounded-[1rem] border-4 border-black bg-red-100 px-4 py-3 font-['Plus_Jakarta_Sans'] text-sm font-black uppercase tracking-[0.08em] text-red-800 shadow-[4px_4px_0_0_#2c1601]">
              {sendError}
            </div>
          ) : null}
          <form className="mx-auto flex max-w-4xl items-center gap-3" onSubmit={sendMessage}>
            <Input
              aria-label="Message Momo"
              className="rounded-[1.5rem] border-4 border-[#2c1601] bg-white px-5 py-4 font-medium shadow-[6px_6px_0_0_#2c1601] focus:ring-[#325347]"
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Type your message to Momo..."
              value={inputValue}
            />
            <Button
              className="shrink-0 rounded-[1.5rem] border-4 border-[#2c1601] px-6 py-4 text-sm font-black uppercase tracking-[0.18em] shadow-[6px_6px_0_0_#2c1601]"
              disabled={!sessionId || isSending}
              isLoading={isSending}
              type="submit"
            >
              Send
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
