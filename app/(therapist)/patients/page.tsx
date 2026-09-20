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

type RosterItem = Connection & { patient?: SharedPatientProfile | null };

export default function TherapistPatientsPage() {
  const { user } = useAuth();
  const [patients, setPatients] = useState<RosterItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      return;
    }

    return observeActiveConnections(user.uid, async (connections) => {
      const enriched = await Promise.all(
        connections.map(async (connection) => ({
          ...connection,
          patient: await getSharedPatientProfile(connection.userId).catch(() => null),
        }))
      );
      setPatients(enriched);
      setLoading(false);
    }, () => { setLoadError("We couldn’t load your patients. Please refresh to try again."); setLoading(false); });
  }, [user?.uid]);

  const visiblePatients = patients.filter((item) => `${item.patient?.displayName ?? ""} ${item.userId}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6 font-['Plus_Jakarta_Sans'] text-[#2c1601]">
      <PageHeader eyebrow="Your care circle" title="My patients" description="A little continuity makes a difference. Find a patient and pick up the conversation." tone="sage">
        <span aria-hidden="true" className="clay-icon material-symbols-outlined size-16 bg-white/60 text-3xl">groups</span>
      </PageHeader>

      <Input aria-label="Search patients" placeholder="Search your patients" value={search} onChange={(event) => setSearch(event.target.value)} leftIcon={<span aria-hidden="true" className="material-symbols-outlined">search</span>} />
      {loadError ? <p role="alert" className="rounded-2xl bg-[#ffdad6] p-5 text-sm text-[#93000a]">{loadError}</p> : loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Spinner label="Loading patients" />
        </div>
      ) : patients.length === 0 ? (
        <EmptyState icon="groups" title="Your care circle starts here" description="Once you accept a connection request, the patient will appear here." href="/portal" action="Review requests" />
      ) : (
        <section className="space-y-4">
          {visiblePatients.length === 0 && <EmptyState icon="search" title="No matching patients" description="Try another name or clear your search." />}
          {visiblePatients.map((connection) => (
            <article className="flex flex-wrap items-center justify-between gap-4 rounded-[2rem] border border-white/80 bg-white/75 p-6 shadow-[0_18px_36px_-22px_rgba(74,107,94,0.2),inset_0_2px_4px_rgba(255,255,255,0.8)]" key={connection.relationshipId}>
              <div className="flex min-w-0 items-center gap-4">
                <Avatar initials={connection.patient?.displayName?.slice(0, 1) || "P"} />
                <div className="min-w-0"><h2 className="text-xl font-medium text-[#325347]">{connection.patient?.displayName || `Patient ${connection.userId.slice(0, 8)}`}</h2>
                <p className="mt-1 text-sm font-light text-[#4a6b5e]">{connection.patient?.isIncognito ? "Incognito profile" : "Connected patient"}</p></div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link className="rounded-full bg-[#fff1e8] px-5 py-3 text-sm font-medium text-[#325347]" href={`/patients/${connection.userId}`}>View profile</Link>
                <Link className="rounded-full bg-[#325347] px-5 py-3 text-sm font-medium text-white shadow-[0_8px_16px_-6px_rgba(50,83,71,0.3),inset_0_1px_0_rgba(255,255,255,0.4)] transition hover:bg-[#4a6b5e] active:scale-95" href={`/messages/${connection.userId}`}>
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
