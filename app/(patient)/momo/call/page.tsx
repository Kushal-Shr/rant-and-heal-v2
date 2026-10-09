"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MomoVoiceCallPanel } from "@/src/components/momo/MomoVoiceCallPanel";
import { Spinner } from "@/src/components/ui/Spinner";
import { useAuth } from "@/src/context/AuthContext";

const momoVoiceEnabled = process.env.NEXT_PUBLIC_MOMO_VOICE_ENABLED === "true";

export default function MomoCallPage() {
  const { user, loading } = useAuth();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [missingConversation, setMissingConversation] = useState(false);

  useEffect(() => {
    if (!momoVoiceEnabled || !user?.uid || conversationId || missingConversation) return;
    const requestedConversationId = new URLSearchParams(window.location.search)
      .get("conversationId")?.trim();
    if (requestedConversationId && requestedConversationId.length <= 128) {
      queueMicrotask(() => setConversationId(requestedConversationId));
    } else {
      queueMicrotask(() => setMissingConversation(true));
    }
  }, [conversationId, missingConversation, user?.uid]);

  if (!momoVoiceEnabled) {
    return <p className="rounded-[1.5rem] bg-[#fff1e8] p-5 text-sm text-[#414845]">Momo voice is not included in the current trial. Text chat remains available.</p>;
  }

  if (loading || (user && !conversationId && !missingConversation)) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Spinner label="Preparing private voice conversation" /></div>;
  }
  if (missingConversation) {
    return <div role="alert" className="rounded-[1.5rem] bg-[#fff1e8] p-5 text-sm text-[#414845]">Choose an existing Momo conversation before starting a voice call. <Link className="font-medium underline" href="/momo">Return to Momo chat</Link>.</div>;
  }
  return <MomoVoiceCallPanel conversationId={conversationId} />;
}
