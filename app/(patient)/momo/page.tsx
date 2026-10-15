"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
import { MomoPortrait } from "@/src/components/shared/MomoPortrait";
import { mergeMomoMessages } from "@/src/lib/momo/messageView";
import { MomoVoiceCallPanel } from "@/src/components/momo/MomoVoiceCallPanel";
import { PostMomoCheckIn } from "@/src/components/mood/PostMomoCheckIn";
import { db } from "@/src/config/firebase";
import { useAuth } from "@/src/context/AuthContext";
import { createUuid } from "@/src/lib/ids/uuid";
import type { ConversationContinuityState } from "@/src/lib/momo/schemas";
import type { EncryptedMomoContent } from "@/src/lib/momo/storageCrypto";
import {
  decryptMomoDocuments,
  decryptStoredMomoContinuity,
  getMomoConversationKey,
  persistEncryptedMomoTurn,
} from "@/src/services/momoConversationService";

const momoVoiceEnabled = process.env.NEXT_PUBLIC_MOMO_VOICE_ENABLED === "true";

type MessageSender = "USER" | "MOMO";

interface MomoMessage {
  id: string;
  sender: MessageSender;
  text: string;
  timestamp: Timestamp | null;
  order: number;
}

interface ChatSession {
  id: string;
  title: string;
  encryptedContinuity?: EncryptedMomoContent;
}

interface FirestoreSession {
  title?: string;
  encryptedContinuity?: EncryptedMomoContent;
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
  const [localMessages, setLocalMessages] = useState<MomoMessage[]>([]);
  const visibleMessages = useMemo(() => mergeMomoMessages(messages, localMessages), [messages, localMessages]);
  const sendInFlightRef = useRef(false);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [continuityState, setContinuityState] = useState<ConversationContinuityState | undefined>();
  const [voicePanelOpen, setVoicePanelOpen] = useState(false);
  const [voiceCallActive, setVoiceCallActive] = useState(false);
  const [liveTranscriptTurns, setLiveTranscriptTurns] = useState<LiveTranscriptTurn[]>([]);
  const [baselineCheckInId, setBaselineCheckInId] = useState<string>();
  const [checkInContextPending, setCheckInContextPending] = useState(false);
  const [postSessionHandled, setPostSessionHandled] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const conversationKeysRef = useRef(new Map<string, CryptoKey>());
  const liveTranscriptIdsRef = useRef<Record<MessageSender, string | null>>({
    USER: null,
    MOMO: null,
  });
  const liveTranscriptTimersRef = useRef<Record<MessageSender, number | null>>({
    USER: null,
    MOMO: null,
  });
  const pendingCheckInIdRef = useRef<string | null>(null);

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
      transcriptId = `live-${sender.toLowerCase()}-${createUuid()}`;
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
    if (sendInFlightRef.current || voiceCallActive) return;
    setVoicePanelOpen(false);
    setVoiceCallActive(false);
    resetLiveTranscript();
    setConversationId(nextConversationId);
    setContinuityState(undefined);
    setMessages([]);
    setIsLoadingMessages(true);
    setLocalMessages([]);
    setInputValue("");
    setSendError(null);
    setPostSessionHandled(false);
    setBaselineCheckInId(undefined);
  }

  const conversationKey = useCallback(async (nextConversationId: string): Promise<CryptoKey> => {
    if (!user) throw new Error("Sign in is required.");
    const cacheId = `${user.uid}:${nextConversationId}`;
    const cached = conversationKeysRef.current.get(cacheId);
    if (cached) return cached;
    const key = await getMomoConversationKey(await user.getIdToken(), nextConversationId);
    conversationKeysRef.current.set(cacheId, key);
    return key;
  }, [user]);

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
            ...(data.encryptedContinuity ? { encryptedContinuity: data.encryptedContinuity } : {}),
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
            console.error("FIRESTORE SESSION INIT ERROR", {
              status: error instanceof Error ? error.name : "UNKNOWN",
            });
          }
          return;
        }

        const requestedConversationId = new URLSearchParams(window.location.search)
          .get("conversationId")?.trim();
        const requestedCheckInId = new URLSearchParams(window.location.search).get("checkInId")?.trim();
        if (requestedCheckInId && requestedCheckInId.length <= 128 && pendingCheckInIdRef.current !== requestedCheckInId) {
          pendingCheckInIdRef.current = requestedCheckInId;
          setCheckInContextPending(true);
        }
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
        console.error("FIRESTORE SESSION INIT ERROR", { status: error.code });
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid || !conversationId) {
      return;
    }

    const firestoreMessagesRef = collection(db, "users", user.uid, "sessions", conversationId, "messages");
    const messagesQuery = query(firestoreMessagesRef, orderBy("createdAt", "desc"), limit(100));

    let active = true;
    let snapshotVersion = 0;
    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const version = ++snapshotVersion;
      void conversationKey(conversationId).then(async (key) => {
        const [nextMessages, nextContinuity] = await Promise.all([
          decryptMomoDocuments(key, user.uid, conversationId, snapshot.docs),
          decryptStoredMomoContinuity(
            key,
            sessions.find((item) => item.id === conversationId)?.encryptedContinuity,
            user.uid,
            conversationId
          ),
        ]);
        if (!active || version !== snapshotVersion) return;
        setMessages(nextMessages.map((message) => ({
          id: message.id,
          sender: message.sender,
          text: message.text,
          timestamp: message.createdAt,
          order: message.messageSequence || (message.createdAt?.toMillis() ?? 0) * 10,
        })));
        const savedIds = new Set(nextMessages.map((message) => message.id));
        setLocalMessages((current) => current.filter((message) => !savedIds.has(message.id)));
        setContinuityState(nextContinuity);
        setIsLoadingMessages(false);
      }).catch(() => {
        if (!active || version !== snapshotVersion) return;
        setIsLoadingMessages(false);
        setSendError("This encrypted conversation could not be opened. Your stored history was not changed.");
      });
    }, (error) => {
      console.error("FIRESTORE MESSAGE LISTENER ERROR:", error.code);
      setIsLoadingMessages(false);
      setSendError("Could not load this conversation. Check your connection and reload the page.");
    });

    return () => { active = false; unsubscribe(); };
  }, [conversationId, conversationKey, sessions, user?.uid]);

  useEffect(() => {
    const container = messagesRef.current;
    if (container) container.scrollTo({ top: visibleMessages.length || liveTranscriptTurns.length ? container.scrollHeight : 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [liveTranscriptTurns, visibleMessages, isSending]);

  useEffect(() => () => clearLiveTranscriptTimers(), []);

  async function sendMessage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!user?.uid || sendInFlightRef.current || voiceCallActive || isLoadingMessages) {
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

    const requestId = createUuid();
    const userMessageId = `${requestId}-user`;
    const order = Math.max(Date.now() * 10, (visibleMessages.at(-1)?.order ?? 0) + 2);
    sendInFlightRef.current = true;
    setLocalMessages((current) => [...current, { id: userMessageId, sender: "USER", text: nextMessage, timestamp: null, order }]);
    setInputValue("");
    setIsSending(true);
    setSendError(null);

    try {
      const userMessageText = nextMessage;

      const idToken = await user.getIdToken();
      // Confirm encrypted persistence is available before sending plaintext to
      // the processing API. There is deliberately no plaintext fallback.
      const key = await conversationKey(conversationId);
      const response = await fetch("/api/momo/chat", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.uid,
          conversationId,
          requestId,
          messageText: userMessageText,
          history: visibleMessages.slice(-12).map((message) => ({
            role: message.sender === "USER" ? "USER" : "MOMO",
            text: message.text,
          })),
          ...(continuityState ? { continuityState } : {}),
          ...(pendingCheckInIdRef.current ? { moodCheckInId: pendingCheckInIdRef.current } : {}),
        }),
      });

      const responsePayload = (await response.json().catch(() => null)) as {
        error?: string;
        code?: string;
        message?: string;
        continuityState?: ConversationContinuityState;
        safety?: { level?: string };
      } | null;

      if (!response.ok) {
        const message = responsePayload?.error ?? "Failed to generate Momo response.";
        if (responsePayload?.code !== "AI_BILLING_REQUIRED") {
          console.error("MOMO API ERROR", { status: response.status, code: responsePayload?.code ?? "REQUEST_FAILED" });
        }
        throw new Error(message);
      } else if (!responsePayload?.message || !responsePayload.continuityState) {
        throw new Error("Momo returned an incomplete encrypted-storage response.");
      } else {
        await persistEncryptedMomoTurn({
          key,
          userId: user.uid,
          conversationId,
          requestId,
          userText: userMessageText,
          momoText: responsePayload.message,
          modality: "text",
          continuityState: responsePayload.continuityState,
        });
        setLocalMessages((current) => [...current, {
          id: `${requestId}-momo`, sender: "MOMO", text: responsePayload.message!, timestamp: null, order: order + 1,
        }]);
        setContinuityState(responsePayload.continuityState);
        if (pendingCheckInIdRef.current) {
          setBaselineCheckInId(pendingCheckInIdRef.current);
          pendingCheckInIdRef.current = null;
          setCheckInContextPending(false);
          window.history.replaceState(null, "", `/momo?conversationId=${encodeURIComponent(conversationId)}`);
        }
        if (responsePayload.safety?.level === "IMMINENT") router.push("/crisis?source=momo");
      }
    } catch (error) {
      const appError = error as FirestoreError;
      console.error("MOMO SEND ERROR", { status: appError.code ?? appError.name ?? "UNKNOWN" });
      setLocalMessages((current) => current.filter((message) => message.id !== userMessageId));
      setInputValue((draft) => draft.trim() ? `${nextMessage}\n\n${draft}` : nextMessage);
      setSendError(appError.message ?? "Could not send your message.");
    } finally {
      sendInFlightRef.current = false;
      setIsSending(false);
    }
  }

  async function createNewSession() {
    if (!user?.uid || sendInFlightRef.current || voiceCallActive) {
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
      console.error("FIRESTORE SESSION INIT ERROR", { status: firestoreError.code ?? "UNKNOWN" });
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
            <Button className="w-full" disabled={isSending || voiceCallActive} onClick={createNewSession}>
              <span aria-hidden="true" className="material-symbols-outlined text-lg">add</span>
              New conversation
            </Button>
          </div>
          <div className="mt-2 flex-1 space-y-2 overflow-y-auto px-2 pb-3">
            <p className="px-3 pb-2 pt-3 text-xs font-medium uppercase tracking-[0.12em] text-[#4a6b5e]/65">Your conversations</p>
            {sessions.map((session) => {
              const isActive = session.id === conversationId;
              return <button disabled={isSending || voiceCallActive} aria-current={isActive ? "page" : undefined} className={`w-full disabled:cursor-not-allowed disabled:opacity-60 rounded-[1.25rem] px-4 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#325347] ${isActive ? "bg-[#c6ebda]/65 text-[#002117] shadow-[inset_0_2px_5px_rgba(44,22,1,0.05)]" : "text-[#414845] hover:bg-[#fff1e8]"}`} key={session.id} onClick={() => chooseConversation(session.id)} type="button"><p className="text-xs font-medium uppercase tracking-[0.1em] opacity-60">Conversation</p><p className="mt-1 truncate text-sm font-medium">{session.title}</p></button>;
            })}
          </div>
        </Card>

        <section className="flex h-[calc(100dvh-8rem)] min-h-[28rem] min-w-0 sm:h-[min(52rem,calc(100dvh-4rem))] sm:min-h-[36rem] flex-col overflow-hidden rounded-[2.5rem] border border-white/75 bg-white/70 shadow-[0_20px_45px_-25px_rgba(121,88,65,0.22),inset_0_2px_4px_rgba(255,255,255,0.8)] backdrop-blur-xl">
          <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[#ffeada] bg-white/70 px-3 py-4 sm:gap-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-2.5">
              <MomoPortrait className="size-10 ring-4 ring-[#e8f3ed] sm:size-12" priority />
              <div className="min-w-0"><h1 className="text-lg font-medium text-[#325347]">Momo</h1><p className="truncate text-[11px] text-[#657267] sm:text-xs">Your AI companion</p></div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {momoVoiceEnabled && conversationId ? (
                <button
                  aria-expanded={voicePanelOpen}
                  aria-label={voicePanelOpen ? "Voice call controls are open" : "Open voice call controls"}
                  className={`inline-flex size-11 items-center justify-center rounded-full text-[#325347] shadow-[0_8px_16px_-6px_rgba(50,83,71,0.2),inset_0_1px_3px_rgba(255,255,255,0.8)] transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#325347] focus-visible:ring-offset-2 ${voicePanelOpen ? "bg-[#abcebf]" : "bg-[#c6ebda] hover:bg-[#abcebf]"}`}
                  disabled={voiceCallActive || isSending}
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
              <button aria-label="New conversation" disabled={isSending || voiceCallActive} className="inline-flex size-11 shrink-0 items-center justify-center gap-1 rounded-full bg-[#fff1e8] text-sm font-medium text-[#795841] transition hover:bg-[#ffe3cd] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#795841] sm:w-auto sm:px-4 xl:hidden" onClick={createNewSession} type="button"><span aria-hidden="true" className="material-symbols-outlined !text-xl">add</span><span className="hidden sm:inline">New</span></button>
            </div>
          </header>

          {voicePanelOpen && conversationId ? (
            <MomoVoiceCallPanel
              embedded
              key={conversationId}
              conversationId={conversationId}
              onCallActiveChange={handleVoiceCallActiveChange}
              onTranscriptDelta={handleLiveTranscriptDelta}
              history={visibleMessages.slice(-12).map((message) => ({
                role: message.sender === "USER" ? "USER" : "MOMO",
                text: message.text,
              }))}
              continuityState={continuityState}
            />
          ) : null}

          <label className="flex shrink-0 items-center gap-3 border-b border-[#ffeada] px-5 py-3 text-xs text-[#596c60] xl:hidden">
            Conversation
            <select disabled={isSending || voiceCallActive} aria-label="Choose a conversation" value={conversationId ?? ""} onChange={(event) => chooseConversation(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-full bg-[#fff1e8] px-3 py-2 text-sm text-[#325347]">
              {!sessions.length && <option value="">Preparing your conversation…</option>}
              {sessions.map((session) => <option key={session.id} value={session.id}>{session.title}</option>)}
            </select>
          </label>

          <div ref={messagesRef} role="log" aria-label="Conversation with Momo" aria-live="polite" aria-relevant="additions text" className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7">
            <div className="mx-auto flex max-w-3xl flex-col gap-5 pb-8">
              {isLoadingMessages ? <div className="flex min-h-48 items-center justify-center"><Spinner label="Opening your conversation…" /></div> : null}
              {!isLoadingMessages && !sendError && visibleMessages.length === 0 && liveTranscriptTurns.length === 0 ? <div className="mx-auto flex max-w-md flex-col items-center rounded-[2rem] bg-[#fff1e8] px-7 py-9 text-center"><MomoPortrait className="size-24" /><h2 className="mt-4 text-xl font-medium text-[#325347]">I&apos;m here whenever you&apos;re ready.</h2><p className="mt-2 text-sm leading-6 text-[#414845]/75">You can write freely, ask for a moment to pause, or tell Momo what kind of support would help.</p></div> : null}
              {visibleMessages.map((message) => {
                const isUserMessage = message.sender === "USER";
                return <div className={`flex gap-3 ${isUserMessage ? "justify-end" : "justify-start"}`} key={message.id}>
                  {!isUserMessage ? <MomoPortrait className="mt-1 size-9" /> : null}
                  <article className={`max-w-[85%] px-4 py-3 text-[15px] font-light leading-7 shadow-sm ${isUserMessage ? "rounded-2xl rounded-br-none bg-[#ffdcc6]/65 text-[#2d1605]" : "rounded-2xl rounded-tl-none bg-[#c6ebda]/45 text-[#2d4d41]"}`}><p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.text}</p></article>
                </div>;
              })}
              {liveTranscriptTurns.map((turn) => {
                const isUserMessage = turn.sender === "USER";
                return <div className={`flex gap-3 ${isUserMessage ? "justify-end" : "justify-start"}`} key={turn.id}>
                  {!isUserMessage ? <MomoPortrait className="mt-1 size-9" /> : null}
                  <article className={`max-w-[85%] border px-4 py-3 text-[15px] font-light leading-7 shadow-sm ${isUserMessage ? "rounded-2xl rounded-br-none border-[#e9bfa4] bg-[#ffdcc6]/45 text-[#2d1605]" : "rounded-2xl rounded-tl-none border-[#9fc8b7] bg-[#c6ebda]/30 text-[#2d4d41]"}`}>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] opacity-55">Live call transcript</p>
                    <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{turn.text}</p>
                  </article>
                </div>;
              })}
              {isSending ? <div role="status" className="flex items-center gap-3"><span className="sr-only">Momo is thinking</span><MomoPortrait className="size-9" /><div className="flex gap-1 rounded-2xl rounded-tl-none bg-[#c6ebda]/30 px-4 py-3"><span className="size-2 animate-bounce rounded-full bg-[#325347]/40" /><span className="size-2 animate-bounce rounded-full bg-[#325347]/40 [animation-delay:150ms]" /><span className="size-2 animate-bounce rounded-full bg-[#325347]/40 [animation-delay:300ms]" /></div></div> : null}

            </div>
          </div>

          <div className="shrink-0 border-t border-[#ffeada] bg-white/85 p-4 sm:p-5">
            {checkInContextPending ? <p className="mx-auto mb-3 max-w-3xl rounded-[1rem] bg-[#c6ebda]/45 px-4 py-2 text-xs text-[#325347]" role="status">Your selected check-in details can quietly guide Momo&apos;s next response.</p> : null}
            {sendError ? <p className="mx-auto mb-3 max-w-3xl rounded-[1rem] bg-[#ffdad6] px-4 py-3 text-sm text-[#93000a]" role="alert">{sendError}</p> : null}
            <form className="mx-auto flex max-w-3xl items-end gap-2 rounded-[1.5rem] border border-[#ffe3cd] bg-[#fff1e8] p-2 shadow-[inset_0_3px_8px_rgba(44,22,1,0.05)]" onSubmit={sendMessage}>
              <Textarea aria-label="Message Momo" disabled={!conversationId || voiceCallActive || isLoadingMessages} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} className="min-h-12 max-h-40 min-w-0 flex-1 rounded-[1rem] bg-transparent px-3 py-2 text-sm shadow-none" onChange={(event) => setInputValue(event.target.value)} placeholder="Type what&apos;s on your mind..." rows={1} value={inputValue} />
              <Button aria-label="Send message" className="size-11 shrink-0 rounded-2xl p-0" disabled={!conversationId || isSending || voiceCallActive || isLoadingMessages || !inputValue.trim()} isLoading={isSending} type="submit"><span aria-hidden="true" className="material-symbols-outlined">send</span></Button>
            </form>
            <p className="mx-auto mt-2 max-w-3xl px-2 text-[11px] text-[#657267]">{voiceCallActive ? "End your voice call to send a text message." : "Enter to send · Shift + Enter for a new line"}</p>
          </div>
        </section>

        <aside className="grid gap-5 lg:grid-cols-2 xl:col-span-2 2xl:col-span-1 2xl:block 2xl:space-y-5">
          <Card className="p-6" padding="none" variant="solid"><p className="text-xs font-medium uppercase tracking-[0.12em] text-[#4a6b5e]/70">This conversation</p><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-[1.25rem] bg-[#fff1e8] p-4"><p className="text-xs text-[#717974]">Messages</p><p className="mt-1 text-2xl font-medium text-[#325347]">{visibleMessages.length}</p></div><div className="rounded-[1.25rem] bg-[#fff1e8] p-4"><p className="text-xs text-[#717974]">Mode</p><p className="mt-1 text-sm font-medium text-[#325347]">Private</p></div></div></Card>
          <Card className="p-6" padding="none" variant="sage"><div className="flex items-center gap-3"><span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-white/60 text-[#325347]"><span className="material-symbols-outlined text-lg">diversity_1</span></span><h2 className="font-medium text-[#2d4d41]">Need more support?</h2></div><p className="mt-3 text-sm leading-6 text-[#2d4d41]/80">You can browse verified therapists or view immediate crisis guidance at any time.</p><div className="mt-5 grid gap-2"><Link className="rounded-full bg-white/70 px-4 py-3 text-center text-sm font-medium text-[#325347] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#325347]" href="/therapy">Find a therapist</Link><Link className="rounded-full border border-[#ba1a1a]/25 bg-[#ffdad6]/60 px-4 py-3 text-center text-sm font-medium text-[#93000a] transition hover:bg-[#ffdad6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ba1a1a]" href="/crisis">Crisis support</Link></div></Card>
          {!postSessionHandled && conversationId && messages.filter((message) => message.sender === "USER").length >= 3 ? <Card className="p-6" padding="none" variant="sage"><PostMomoCheckIn baselineCheckInId={baselineCheckInId} conversationId={conversationId} onSaved={() => setPostSessionHandled(true)} uid={user.uid} /></Card> : null}
          <p className="px-3 text-xs leading-5 text-[#717974]">Momo is a supportive AI companion, not an emergency service or a replacement for professional care.</p>
        </aside>
      </div>
    </div>
  );
}
