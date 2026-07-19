"use client";

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
  const [busyPatientId, setBusyPatientId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      return;
    }

    const unsubPending = observePendingConnections(user.uid, (connections) => {
      setPending(connections);
      setLoading(false);
    });
    const unsubActive = observeActiveConnections(user.uid, setActive);

    return () => {
      unsubPending();
      unsubActive();
    };
  }, [user?.uid]);

  async function respond(patientId: string, action: "accept" | "reject") {
    setBusyPatientId(patientId);

    try {
      if (action === "accept") {
        await acceptConnection(patientId);
      } else {
        await rejectConnection(patientId);
      }
    } finally {
      setBusyPatientId(null);
    }
  }

  return (
    <div className="space-y-6 font-['Plus_Jakarta_Sans'] text-[#2c1601]">
      <header className="border-2 border-[#2c1601] bg-[#fff8f5] p-6 shadow-[8px_8px_0_#abcebf]">
        <p className="text-sm font-bold uppercase text-[#4a6b5e]">Practitioner portal</p>
        <h1 className="mt-2 text-3xl font-black">Connection requests</h1>
      </header>

      <section className="grid gap-5 sm:grid-cols-2">
        <div className="border-2 border-[#2c1601] bg-[#ffd86b] p-5 shadow-[6px_6px_0_#2c1601]">
          <p className="text-sm font-black uppercase">Pending</p>
          <p className="mt-2 text-4xl font-black">{pending.length}</p>
        </div>
        <div className="border-2 border-[#2c1601] bg-[#abcebf] p-5 shadow-[6px_6px_0_#2c1601]">
          <p className="text-sm font-black uppercase">Active patients</p>
          <p className="mt-2 text-4xl font-black">{active.length}</p>
        </div>
      </section>

      <section className="border-2 border-[#2c1601] bg-white p-5 shadow-[8px_8px_0_#e1d4ff]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-black">Pending requests</h2>
          <Link className="font-black text-[#4a6b5e] underline" href="/patients">View roster</Link>
        </div>
        {loading ? (
          <div className="mt-8 flex justify-center">
            <Spinner label="Loading requests" />
          </div>
        ) : pending.length === 0 ? (
          <p className="mt-5 border-2 border-[#2c1601] bg-[#fff8f5] p-4 font-bold">No pending requests.</p>
        ) : (
          <div className="mt-5 space-y-4">
            {pending.map((connection) => (
              <article className="flex flex-wrap items-center justify-between gap-4 border-2 border-[#2c1601] bg-[#fff8f5] p-4" key={connection.userId}>
                <div>
                  <h3 className="font-black">Patient {connection.userId.slice(0, 8)}</h3>
                  <p className="text-sm font-bold text-[#4a6b5e]">Consent proof recorded</p>
                </div>
                <div className="flex gap-3">
                  <Button className="rounded-none border-2 border-[#2c1601] shadow-[4px_4px_0_#2c1601]" isLoading={busyPatientId === connection.userId} onClick={() => respond(connection.userId, "accept")}>
                    Accept
                  </Button>
                  <Button className="rounded-none border-2 border-[#2c1601] shadow-[4px_4px_0_#2c1601]" onClick={() => respond(connection.userId, "reject")} variant="danger">
                    Reject
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
