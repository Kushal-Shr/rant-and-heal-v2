"use client";

import { Avatar } from "@/src/components/ui/Avatar";
import { Input } from "@/src/components/forms/Input";
import { PageHeader } from "@/src/components/shared/PageHeader";
import { EmptyState } from "@/src/components/shared/EmptyState";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Spinner } from "@/src/components/ui/Spinner";
import { useAuth } from "@/src/context/AuthContext";
import { getSharedPatientProfile, observeActiveConnections } from "@/src/services/connectionService";
import { Connection, SharedPatientProfile } from "@/src/types/database";

type MessageThread = Connection & { patient?: SharedPatientProfile | null };

export default function TherapistMessagesPage() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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
            patient: await getSharedPatientProfile(connection.userId).catch(() => null),
          }))
        );

        setThreads(enriched);
        setLoading(false);
      },
      (error) => {
        console.error("Failed to load message threads:", error);
        setLoadError("We couldn’t load your conversations. Please refresh to try again.");
        setLoading(false);
      }
    );
  }, [user?.uid]);

  const visibleThreads = threads.filter((item) => `${item.patient?.displayName ?? ""} ${item.userId}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6 font-['Plus_Jakarta_Sans'] text-[#2c1601]">
      <PageHeader eyebrow="Stay connected" title="Conversations" description="A quiet space for the conversations that continue between sessions." tone="peach">
        <span aria-hidden="true" className="clay-icon material-symbols-outlined size-16 bg-white/60 text-3xl">forum</span>
      </PageHeader>

      <Input aria-label="Search conversations" placeholder="Find a conversation" value={search} onChange={(event) => setSearch(event.target.value)} leftIcon={<span aria-hidden="true" className="material-symbols-outlined">search</span>} />
      {loadError ? <p role="alert" className="rounded-2xl bg-[#ffdad6] p-5 text-sm text-[#93000a]">{loadError}</p> : loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Spinner label="Loading conversations" />
        </div>
      ) : threads.length === 0 ? (
        <EmptyState icon="forum" title="Make room for a conversation" description="Accept a patient’s connection request to start messaging here." href="/portal" action="Review requests" />
      ) : (
        <section className="space-y-4">
          {visibleThreads.length === 0 && <EmptyState icon="search" title="No matching conversations" description="Try another name or clear your search." />}
          {visibleThreads.map((thread) => (
            <Link
              className="block rounded-[2rem] border border-white/80 bg-white/75 p-6 shadow-[0_18px_36px_-22px_rgba(74,107,94,0.2),inset_0_2px_4px_rgba(255,255,255,0.8)] transition-all hover:-translate-y-1 hover:bg-white"
              href={`/messages/${thread.userId}`}
              key={thread.relationshipId}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-4">
                  <Avatar initials={thread.patient?.displayName?.slice(0, 1) || "P"} />
                  <div className="min-w-0"><h2 className="text-xl font-medium text-[#325347]">
                    {thread.patient?.displayName || `Patient ${thread.userId.slice(0, 8)}`}
                  </h2>
                  <p className="mt-1 text-sm font-light text-[#4a6b5e]">
                    {thread.lastMessageAt ? "Open conversation" : "No messages yet"}
                  </p></div>
                </div>
                <span className="rounded-full bg-[#c6ebda] px-4 py-2 text-sm font-medium text-[#325347] shadow-[inset_0_1px_3px_rgba(255,255,255,0.8)]">
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
