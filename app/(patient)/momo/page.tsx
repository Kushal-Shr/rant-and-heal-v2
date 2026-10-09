"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  limit,
  serverTimestamp,
  type FirestoreError,
  type Timestamp,
} from "firebase/firestore";
import { Button } from "@/src/components/ui/Button";
import { Textarea } from "@/src/components/forms/Textarea";
import { Card } from "@/src/components/ui/Card";
import { Spinner } from "@/src/components/ui/Spinner";
import { MomoVoiceCallPanel } from "@/src/components/momo/MomoVoiceCallPanel";
import { db } from "@/src/config/firebase";
import { useAuth } from "@/src/context/AuthContext";

const momoVoiceEnabled = process.env.NEXT_PUBLIC_MOMO_VOICE_ENABLED === "true";

type MessageSender = "USER" | "MOMO";

interface MomoMessage {
  id: string;
  sender: MessageSender;
  text: string;
  timestamp: Timestamp | null;
  order: number;
}

interface FirestoreMomoMessage {
  sender?: MessageSender;
  text?: string;
  timestamp?: Timestamp | null;
  order?: number;
}

interface ChatSession {
  id: string;
  title: string;
}

interface FirestoreSession {
  title?: string;
}

interface LiveTranscriptTurn {
  id: string;
  sender: MessageSender;
  text: string;
}

const LIVE_TRANSCRIPT_GAP_MS = 1_200;
const MAX_LIVE_TRANSCRIPT_TURNS = 20;
const MAX_LIVE_TRANSCRIPT_CHARS = 2_000;

export default function MomoPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MomoMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [voicePanelOpen, setVoicePanelOpen] = useState(false);
  const [voiceCallActive, setVoiceCallActive] = useState(false);
  const [liveTranscriptTurns, setLiveTranscriptTurns] = useState<LiveTranscriptTurn[]>([]);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const liveTranscriptIdsRef = useRef<Record<MessageSender, string | null>>({
    USER: null,
    MOMO: null,
  });
  const liveTranscriptTimersRef = useRef<Record<MessageSender, number | null>>({
    USER: null,
    MOMO: null,
  });

  function clearLiveTranscriptTimers() {
    for (const sender of ["USER", "MOMO"] as const) {
      const timer = liveTranscriptTimersRef.current[sender];
      if (timer !== null) window.clearTimeout(timer);
      liveTranscriptTimersRef.current[sender] = null;
      liveTranscriptIdsRef.current[sender] = null;
    }
  }

  function resetLiveTranscript() {
    clearLiveTranscriptTimers();
    setLiveTranscriptTurns([]);
  }

  function handleVoiceCallActiveChange(active: boolean) {
    setVoiceCallActive(active);
    resetLiveTranscript();
  }

  function handleLiveTranscriptDelta(sender: MessageSender, delta: string) {
    if (!delta) return;
    let transcriptId = liveTranscriptIdsRef.current[sender];
    if (!transcriptId) {
      transcriptId = `live-${sender.toLowerCase()}-${crypto.randomUUID()}`;
      liveTranscriptIdsRef.current[sender] = transcriptId;
    }
    const currentId = transcriptId;
    setLiveTranscriptTurns((current) => {
      const existing = current.findIndex((turn) => turn.id === currentId);
      if (existing >= 0) {
        return current.map((turn, index) => index === existing
          ? { ...turn, text: `${turn.text}${delta}`.slice(-MAX_LIVE_TRANSCRIPT_CHARS) }
          : turn);
      }
      return [...current.slice(-(MAX_LIVE_TRANSCRIPT_TURNS - 1)), {
        id: currentId,
        sender,
        text: delta,
      }];
    });
    const previousTimer = liveTranscriptTimersRef.current[sender];
    if (previousTimer !== null) window.clearTimeout(previousTimer);
    liveTranscriptTimersRef.current[sender] = window.setTimeout(() => {
      if (liveTranscriptIdsRef.current[sender] === currentId) {
        liveTranscriptIdsRef.current[sender] = null;
      }
      liveTranscriptTimersRef.current[sender] = null;
    }, LIVE_TRANSCRIPT_GAP_MS);
  }

  function chooseConversation(nextConversationId: string) {
    setVoicePanelOpen(false);
    setVoiceCallActive(false);
    resetLiveTranscript();
    setConversationId(nextConversationId);
  }

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
    const sessionsQuery = query(sessionsRef, orderBy("createdAt", "desc"), limit(30));

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
            setConversationId(newSessionRef.id);
          } catch (error) {
            console.error("FIRESTORE SESSION INIT ERROR:", error);
          }
          return;
        }

        const requestedConversationId = new URLSearchParams(window.location.search)
          .get("conversationId")?.trim();
        setConversationId((currentConversationId) => {
          if (currentConversationId && nextSessions.some((item) => item.id === currentConversationId)) {
            return currentConversationId;
          }
          if (requestedConversationId && nextSessions.some((item) => item.id === requestedConversationId)) {
            return requestedConversationId;
          }
          return nextSessions[0].id;
        });
      },
      (error) => {
        console.error("FIRESTORE SESSION INIT ERROR:", error);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid || !conversationId) {
      return;
    }

    const messagesRef = collection(db, "users", user.uid, "sessions", conversationId, "messages");
    const messagesQuery = query(messagesRef, orderBy("timestamp", "desc"), limit(100));

    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const nextMessages = snapshot.docs.map((messageDoc) => {
        const data = messageDoc.data() as FirestoreMomoMessage;

        return {
          id: messageDoc.id,
          sender: (data.sender === "USER" ? "USER" : "MOMO") as MessageSender,
          text: typeof data.text === "string" ? data.text : "",
          timestamp: data.timestamp ?? null,
          order: typeof data.order === "number" ? data.order : 0,
        };
      }).sort((left, right) => {
        const time = (left.timestamp?.toMillis() ?? 0) - (right.timestamp?.toMillis() ?? 0);
        return time || left.order - right.order;
      });

      setMessages(nextMessages);
    }, (error) => {
      console.error("FIRESTORE MESSAGE LISTENER ERROR:", error.code);
      setSendError("Could not load this conversation. Check your connection and reload the page.");
    });

    return () => unsubscribe();
  }, [conversationId, user?.uid]);

  useEffect(() => {
    const container = messagesRef.current;
    if (container) container.scrollTo({ top: container.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [liveTranscriptTurns, messages]);

  useEffect(() => () => clearLiveTranscriptTimers(), []);

  async function sendMessage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!user?.uid || isSending) {
      return;
    }

    if (!conversationId) {
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
          conversationId,
          requestId: crypto.randomUUID(),
          messageText: userMessageText,
        }),
      });

      const responsePayload = (await response.json().catch(() => null)) as {
        error?: string;
        code?: string;
        safety?: { level?: string };
      } | null;

      if (!response.ok) {
        const message = responsePayload?.error ?? "Failed to generate Momo response.";
        if (responsePayload?.code !== "AI_BILLING_REQUIRED") {
          console.error("MOMO API ERROR:", response.status, message);
        }
        setInputValue(userMessageText);
        setSendError(message);
      } else if (responsePayload?.safety?.level === "IMMINENT") {
        router.push("/crisis?source=momo");
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
      chooseConversation(newSessionRef.id);
    } catch (error) {
      const firestoreError = error as FirestoreError;
      console.error("FIRESTORE SESSION INIT ERROR:", firestoreError.code, firestoreError.message);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Spinner size="lg" label="Loading Momo..." />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-w-0">


      <div className="mx-auto grid max-w-[92rem] gap-6 xl:grid-cols-[13rem_minmax(0,1fr)] 2xl:grid-cols-[13rem_minmax(0,1fr)_16rem]">
        <Card className="hidden h-[min(52rem,calc(100dvh-4rem))] min-h-[36rem] flex-col p-4 xl:flex" padding="none" variant="solid">
          <div className="p-3">
            <Button className="w-full" onClick={createNewSession}>
              <span aria-hidden="true" className="material-symbols-outlined text-lg">add</span>
              New conversation
            </Button>
          </div>
          <div className="mt-2 flex-1 space-y-2 overflow-y-auto px-2 pb-3">
            <p className="px-3 pb-2 pt-3 text-xs font-medium uppercase tracking-[0.12em] text-[#4a6b5e]/65">Your conversations</p>
            {sessions.map((session) => {
              const isActive = session.id === conversationId;
              return <button className={`w-full rounded-[1.25rem] px-4 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#325347] ${isActive ? "bg-[#c6ebda]/65 text-[#002117] shadow-[inset_0_2px_5px_rgba(44,22,1,0.05)]" : "text-[#414845] hover:bg-[#fff1e8]"}`} key={session.id} onClick={() => chooseConversation(session.id)} type="button"><p className="text-xs font-medium uppercase tracking-[0.1em] opacity-60">Conversation</p><p className="mt-1 truncate text-sm font-medium">{session.title}</p></button>;
            })}
          </div>
        </Card>

        <section className="flex h-[min(52rem,calc(100dvh-4rem))] min-h-[36rem] min-w-0 flex-col overflow-hidden rounded-[2.5rem] border border-white/75 bg-white/70 shadow-[0_20px_45px_-25px_rgba(121,88,65,0.22),inset_0_2px_4px_rgba(255,255,255,0.8)] backdrop-blur-xl">
          <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[#ffeada] bg-white/70 px-5 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <div aria-hidden="true" className="flex size-11 items-center justify-center rounded-full bg-[#c6ebda] text-[#325347] shadow-[inset_0_2px_4px_rgba(255,255,255,0.75)]"><span className="material-symbols-outlined">cloud</span></div>
              <div><p className="text-lg font-medium text-[#325347]">Momo</p><p className="text-xs text-[#717974]">Your AI companion</p></div>
            </div>
            <div className="flex items-center gap-2">
              {momoVoiceEnabled && conversationId ? (
                <button
                  aria-expanded={voicePanelOpen}
                  aria-label={voicePanelOpen ? "Voice call controls are open" : "Open voice call controls"}
                  className={`inline-flex size-11 items-center justify-center rounded-full text-[#325347] shadow-[0_8px_16px_-6px_rgba(50,83,71,0.2),inset_0_1px_3px_rgba(255,255,255,0.8)] transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#325347] focus-visible:ring-offset-2 ${voicePanelOpen ? "bg-[#abcebf]" : "bg-[#c6ebda] hover:bg-[#abcebf]"}`}
                  disabled={voiceCallActive}
                  onClick={() => {
                    if (voicePanelOpen) resetLiveTranscript();
                    setVoicePanelOpen((open) => !open);
                  }}
                  title={voicePanelOpen ? "Voice call controls open" : "Call Momo"}
                  type="button"
                >
                  <span aria-hidden="true" className="material-symbols-outlined">{voiceCallActive ? "graphic_eq" : "call"}</span>
                </button>
              ) : null}
              <button className="rounded-full bg-[#fff1e8] px-4 py-2 text-sm font-medium text-[#795841] transition hover:bg-[#ffe3cd] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#795841] xl:hidden" onClick={createNewSession} type="button"><span aria-hidden="true" className="material-symbols-outlined mr-1 align-[-3px] text-base">add</span>New</button>
            </div>
          </header>

          {voicePanelOpen && conversationId ? (
            <MomoVoiceCallPanel
              embedded
              key={conversationId}
              conversationId={conversationId}
              onCallActiveChange={handleVoiceCallActiveChange}
              onTranscriptDelta={handleLiveTranscriptDelta}
            />
          ) : null}

          <label className="flex shrink-0 items-center gap-3 border-b border-[#ffeada] px-5 py-3 text-xs text-[#596c60] xl:hidden">
            Conversation
            <select aria-label="Choose a conversation" value={conversationId ?? ""} onChange={(event) => chooseConversation(event.target.value)} className="min-w-0 flex-1 rounded-full bg-[#fff1e8] px-3 py-2 text-sm text-[#325347]">
              {!sessions.length && <option value="">Preparing your conversation…</option>}
              {sessions.map((session) => <option key={session.id} value={session.id}>{session.title}</option>)}
            </select>
          </label>

          <div ref={messagesRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7">
            <div className="mx-auto flex max-w-3xl flex-col gap-5 pb-8">
              {messages.length === 0 && liveTranscriptTurns.length === 0 ? <div className="mx-auto flex max-w-md flex-col items-center rounded-[2rem] bg-[#fff1e8] px-7 py-9 text-center"><div aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-[#c6ebda] text-[#325347]"><span className="material-symbols-outlined">waving_hand</span></div><h1 className="mt-4 text-xl font-medium text-[#325347]">I&apos;m here whenever you&apos;re ready.</h1><p className="mt-2 text-sm leading-6 text-[#414845]/75">You can write freely, ask for a moment to pause, or tell Momo what kind of support would help.</p></div> : null}
              {messages.map((message) => {
                const isUserMessage = message.sender === "USER";
                return <div className={`flex gap-3 ${isUserMessage ? "justify-end" : "justify-start"}`} key={message.id}>
                  {!isUserMessage ? <div aria-hidden="true" className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-[#c6ebda] text-[#325347]"><span className="material-symbols-outlined text-sm">cloud</span></div> : null}
                  <article className={`max-w-[85%] px-4 py-3 text-[15px] font-light leading-7 shadow-sm ${isUserMessage ? "rounded-2xl rounded-br-none bg-[#ffdcc6]/65 text-[#2d1605]" : "rounded-2xl rounded-tl-none bg-[#c6ebda]/45 text-[#2d4d41]"}`}><p className="whitespace-pre-wrap">{message.text}</p></article>
                </div>;
              })}
              {liveTranscriptTurns.map((turn) => {
                const isUserMessage = turn.sender === "USER";
                return <div className={`flex gap-3 ${isUserMessage ? "justify-end" : "justify-start"}`} key={turn.id}>
                  {!isUserMessage ? <div aria-hidden="true" className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-[#c6ebda] text-[#325347]"><span className="material-symbols-outlined text-sm">graphic_eq</span></div> : null}
                  <article className={`max-w-[85%] border px-4 py-3 text-[15px] font-light leading-7 shadow-sm ${isUserMessage ? "rounded-2xl rounded-br-none border-[#e9bfa4] bg-[#ffdcc6]/45 text-[#2d1605]" : "rounded-2xl rounded-tl-none border-[#9fc8b7] bg-[#c6ebda]/30 text-[#2d4d41]"}`}>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] opacity-55">Live call transcript</p>
                    <p className="whitespace-pre-wrap">{turn.text}</p>
                  </article>
                </div>;
              })}
              {isSending ? <div className="flex items-center gap-3"><div aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-[#c6ebda] text-[#325347]"><span className="material-symbols-outlined text-sm">cloud</span></div><div className="flex gap-1 rounded-2xl rounded-tl-none bg-[#c6ebda]/30 px-4 py-3"><span className="size-2 animate-bounce rounded-full bg-[#325347]/40" /><span className="size-2 animate-bounce rounded-full bg-[#325347]/40 [animation-delay:150ms]" /><span className="size-2 animate-bounce rounded-full bg-[#325347]/40 [animation-delay:300ms]" /></div></div> : null}

            </div>
          </div>

          <div className="shrink-0 border-t border-[#ffeada] bg-white/85 p-4 sm:p-5">
            {sendError ? <p className="mx-auto mb-3 max-w-3xl rounded-[1rem] bg-[#ffdad6] px-4 py-3 text-sm text-[#93000a]" role="alert">{sendError}</p> : null}
            <form className="mx-auto flex max-w-3xl items-end gap-2 rounded-[1.5rem] border border-[#ffe3cd] bg-[#fff1e8] p-2 shadow-[inset_0_3px_8px_rgba(44,22,1,0.05)]" onSubmit={sendMessage}>
              <Textarea aria-label="Message Momo" className="min-h-12 flex-1 rounded-[1rem] bg-transparent px-3 py-2 text-sm shadow-none" onChange={(event) => setInputValue(event.target.value)} placeholder="Type what&apos;s on your mind..." rows={1} value={inputValue} />
              <Button aria-label="Send message" className="size-11 shrink-0 rounded-2xl p-0" disabled={!conversationId || isSending || !inputValue.trim()} isLoading={isSending} type="submit"><span aria-hidden="true" className="material-symbols-outlined">send</span></Button>
            </form>
          </div>
        </section>

        <aside className="grid gap-5 sm:grid-cols-2 xl:col-span-2 2xl:col-span-1 2xl:block 2xl:space-y-5">
          <Card className="p-6" padding="none" variant="solid"><p className="text-xs font-medium uppercase tracking-[0.12em] text-[#4a6b5e]/70">This conversation</p><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-[1.25rem] bg-[#fff1e8] p-4"><p className="text-xs text-[#717974]">Messages</p><p className="mt-1 text-2xl font-medium text-[#325347]">{messages.length}</p></div><div className="rounded-[1.25rem] bg-[#fff1e8] p-4"><p className="text-xs text-[#717974]">Mode</p><p className="mt-1 text-sm font-medium text-[#325347]">Private</p></div></div></Card>
          <Card className="p-6" padding="none" variant="sage"><div className="flex items-center gap-3"><span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-white/60 text-[#325347]"><span className="material-symbols-outlined text-lg">diversity_1</span></span><h2 className="font-medium text-[#2d4d41]">Need more support?</h2></div><p className="mt-3 text-sm leading-6 text-[#2d4d41]/80">You can browse verified therapists or view immediate crisis guidance at any time.</p><div className="mt-5 grid gap-2"><Link className="rounded-full bg-white/70 px-4 py-3 text-center text-sm font-medium text-[#325347] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#325347]" href="/therapy">Find a therapist</Link><Link className="rounded-full border border-[#ba1a1a]/25 bg-[#ffdad6]/60 px-4 py-3 text-center text-sm font-medium text-[#93000a] transition hover:bg-[#ffdad6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ba1a1a]" href="/crisis">Crisis support</Link></div></Card>
          <p className="px-3 text-xs leading-5 text-[#717974]">Momo is a supportive AI companion, not an emergency service or a replacement for professional care.</p>
        </aside>
      </div>
    </div>
  );
}
