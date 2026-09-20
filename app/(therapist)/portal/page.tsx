"use client";

import { PageHeader } from "@/src/components/shared/PageHeader";
import { EmptyState } from "@/src/components/shared/EmptyState";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/src/components/ui/Button";
import { Spinner } from "@/src/components/ui/Spinner";
import { useAuth } from "@/src/context/AuthContext";
import {
  acceptConnection,
  observeActiveConnections,
  observePendingConnections,
  rejectConnection,
} from "@/src/services/connectionService";
import { Connection } from "@/src/types/database";

export default function TherapistPortalPage() {
  const { user } = useAuth();
  const [pending, setPending] = useState<Connection[]>([]);
  const [active, setActive] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyPatientId, setBusyPatientId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      return;
    }

    const onError = () => { setLoadError("We couldn’t load your connections. Please refresh to try again."); setLoading(false); };
    const unsubPending = observePendingConnections(user.uid, (connections) => {
      setPending(connections);
      setLoading(false);
    }, onError);
    const unsubActive = observeActiveConnections(user.uid, setActive, onError);

    return () => {
      unsubPending();
      unsubActive();
    };
  }, [user?.uid]);

  async function respond(relationshipId: string, action: "accept" | "reject") {
    setBusyPatientId(relationshipId);

    setActionError(null);
    try {
      if (action === "accept") {
        await acceptConnection(relationshipId);
      } else {
        await rejectConnection(relationshipId);
      }
    } catch {
      setActionError("The request couldn’t be updated. Please try again.");
    } finally {
      setBusyPatientId(null);
    }
  }

  return (
    <div className="space-y-6 font-['Plus_Jakarta_Sans'] text-[#2c1601]">
      <PageHeader eyebrow="Your practice, at a glance" title="Space for thoughtful care" description="Review connection requests and stay close to the people in your care." tone="sage">
        <span aria-hidden="true" className="clay-icon material-symbols-outlined size-16 bg-white/60 text-3xl">spa</span>
      </PageHeader>

      {(loadError || actionError) && <p role="alert" className="rounded-2xl bg-[#ffdad6] p-4 text-sm text-[#93000a]">{loadError || actionError}</p>}
      <section className="grid gap-5 sm:grid-cols-2">
        <div className="rounded-[2rem] border border-white/70 bg-[#ffe3cd] p-6 shadow-[0_16px_32px_-20px_rgba(121,88,65,0.22),inset_0_2px_4px_rgba(255,255,255,0.75)]">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#795841]/70">Pending</p>
          <p className="mt-2 text-4xl font-medium text-[#795841]">{loading || loadError ? "—" : pending.length}</p>
        </div>
        <div className="rounded-[2rem] border border-white/70 bg-[#c6ebda]/75 p-6 shadow-[0_16px_32px_-20px_rgba(74,107,94,0.2),inset_0_2px_4px_rgba(255,255,255,0.75)]">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#2d4d41]/70">Active patients</p>
          <p className="mt-2 text-4xl font-medium text-[#325347]">{loading || loadError ? "—" : active.length}</p>
        </div>
      </section>

      <section className="rounded-[2.5rem] border border-white/80 bg-white/75 p-6 shadow-[0_20px_40px_-20px_rgba(121,88,65,0.22),inset_0_2px_4px_rgba(255,255,255,0.85)] sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-medium text-[#325347]">Pending requests</h2>
          <Link className="rounded-full bg-[#fff1e8] px-4 py-2 text-sm font-medium text-[#325347] transition hover:bg-[#ffe3cd]" href="/patients">View roster</Link>
        </div>
        {loading ? (
          <div className="mt-8 flex justify-center">
            <Spinner label="Loading requests" />
          </div>
        ) : loadError ? null : pending.length === 0 ? (
          <div className="mt-5"><EmptyState icon="mark_email_read" title="You’re all caught up" description="New connection requests will appear here. In the meantime, you can check in with your current patients." href="/patients" action="View my patients" /></div>
        ) : (
          <div className="mt-5 space-y-4">
            {pending.map((connection) => (
              <article className="flex flex-wrap items-center justify-between gap-4 rounded-[1.75rem] bg-[#fff1e8] p-5 shadow-[inset_0_3px_8px_rgba(44,22,1,0.035)]" key={connection.userId}>
                <div>
                  <h3 className="font-medium text-[#2c1601]">Patient {connection.userId.slice(0, 8)}</h3>
                  <p className="mt-1 text-sm font-light text-[#4a6b5e]">Connection request received</p>
                </div>
                <div className="flex gap-3">
                  <Button disabled={busyPatientId !== null} isLoading={busyPatientId === connection.relationshipId} onClick={() => respond(connection.relationshipId, "accept")}>
                    Accept
                  </Button>
                  <Button disabled={busyPatientId !== null} onClick={() => respond(connection.relationshipId, "reject")} variant="danger">
                    Decline
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
