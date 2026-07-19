"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Spinner } from "@/src/components/ui/Spinner";
import { useAuth } from "@/src/context/AuthContext";
import { observeActiveConnections } from "@/src/services/connectionService";
import { getUserProfile } from "@/src/services/userService";
import { Connection, UserProfile } from "@/src/types/database";

type RosterItem = Connection & { patient?: UserProfile | null };

export default function TherapistPatientsPage() {
  const { user } = useAuth();
  const [patients, setPatients] = useState<RosterItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      return;
    }

    return observeActiveConnections(user.uid, async (connections) => {
      const enriched = await Promise.all(
        connections.map(async (connection) => ({
          ...connection,
          patient: await getUserProfile(connection.userId).catch(() => null),
        }))
      );
      setPatients(enriched);
      setLoading(false);
    });
  }, [user?.uid]);

  return (
    <div className="space-y-6 font-['Plus_Jakarta_Sans'] text-[#2c1601]">
      <header className="border-2 border-[#2c1601] bg-[#fff8f5] p-6 shadow-[8px_8px_0_#abcebf]">
        <p className="text-sm font-bold uppercase text-[#4a6b5e]">Accepted connections</p>
        <h1 className="mt-2 text-3xl font-black">Active patient roster</h1>
      </header>

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Spinner label="Loading patients" />
        </div>
      ) : patients.length === 0 ? (
        <p className="border-2 border-[#2c1601] bg-white p-5 font-bold shadow-[6px_6px_0_#e1d4ff]">No active patients yet.</p>
      ) : (
        <section className="space-y-4">
          {patients.map((connection) => (
            <article className="flex flex-wrap items-center justify-between gap-4 border-2 border-[#2c1601] bg-white p-5 shadow-[6px_6px_0_#abcebf]" key={connection.userId}>
              <div>
                <h2 className="text-xl font-black">{connection.patient?.displayName || `Patient ${connection.userId.slice(0, 8)}`}</h2>
                <p className="text-sm font-bold text-[#4a6b5e]">{connection.patient?.isIncognito ? "Incognito profile" : connection.patient?.email}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link className="border-2 border-[#2c1601] bg-[#ffd86b] px-5 py-3 font-black shadow-[4px_4px_0_#2c1601]" href={`/messages/${connection.userId}`}>
                  Message
                </Link>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
