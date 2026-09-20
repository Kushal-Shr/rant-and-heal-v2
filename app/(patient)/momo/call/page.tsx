"use client";

import { useEffect, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { MomoVoiceCallPanel } from "@/src/components/momo/MomoVoiceCallPanel";
import { Spinner } from "@/src/components/ui/Spinner";
import { db } from "@/src/config/firebase";
import { useAuth } from "@/src/context/AuthContext";

export default function MomoCallPage() {
  const { user, loading } = useAuth();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    let active = true;
    addDoc(collection(db, "users", user.uid, "sessions"), {
      title: "Voice conversation",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }).then(
      (session) => { if (active) setSessionId(session.id); },
      () => { if (active) setError(true); }
    );
    return () => { active = false; };
  }, [user?.uid]);

  if (loading || (user && !sessionId && !error)) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Spinner label="Preparing private voice conversation" /></div>;
  }
  if (error) {
    return <p role="alert" className="rounded-[1.5rem] bg-[#ffdad6] p-5 text-sm text-[#93000a]">Momo could not create a secure conversation. Please return to chat and try again.</p>;
  }
  return <MomoVoiceCallPanel sessionId={sessionId} />;
}
