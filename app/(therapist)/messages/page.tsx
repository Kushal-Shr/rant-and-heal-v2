"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Spinner } from "@/src/components/ui/Spinner";
import { useAuth } from "@/src/context/AuthContext";
import { observeActiveConnections } from "@/src/services/connectionService";
import { getUserProfile } from "@/src/services/userService";
import { Connection, UserProfile } from "@/src/types/database";

type MessageThread = Connection & { patient?: UserProfile | null };

export default function TherapistMessagesPage() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      return;
    }

    return observeActiveConnections(
      user.uid,
      async (connections) => {
        const enriched = await Promise.all(
          connections.map(async (connection) => ({
            ...connection,
            patient: await getUserProfile(connection.userId).catch(() => null),
          }))
        );

        setThreads(enriched);
        setLoading(false);
      },
      (error) => {
        console.error("Failed to load message threads:", error);
        setLoading(false);
      }
    );
  }, [user?.uid]);

  return (
    <div className="space-y-6 font-['Plus_Jakarta_Sans'] text-[#2c1601]">
      <header className="border-2 border-[#2c1601] bg-[#fff8f5] p-6 shadow-[8px_8px_0_#abcebf]">
        <p className="text-sm font-bold uppercase text-[#4a6b5e]">Therapist messages</p>
        <h1 className="mt-2 text-3xl font-black">Patient conversations</h1>
      </header>

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Spinner label="Loading conversations" />
        </div>
      ) : threads.length === 0 ? (
        <p className="border-2 border-[#2c1601] bg-white p-5 font-bold shadow-[6px_6px_0_#e1d4ff]">
          No active patient conversations yet. Accept a connection request first.
        </p>
      ) : (
        <section className="space-y-4">
          {threads.map((thread) => (
            <Link
              className="block border-2 border-[#2c1601] bg-white p-5 shadow-[6px_6px_0_#abcebf] transition-transform hover:-translate-y-0.5"
              href={`/messages/${thread.userId}`}
              key={thread.userId}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black">
                    {thread.patient?.displayName || `Patient ${thread.userId.slice(0, 8)}`}
                  </h2>
                  <p className="mt-1 text-sm font-bold text-[#4a6b5e]">
                    {thread.lastMessageAt ? "Open conversation" : "No messages yet"}
                  </p>
                </div>
                <span className="border-2 border-[#2c1601] bg-[#ffd86b] px-4 py-2 text-sm font-black">
                  Message
                </span>
              </div>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
