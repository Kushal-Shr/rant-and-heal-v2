"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Spinner } from "@/src/components/ui/Spinner";
import { getUserProfile } from "@/src/services/userService";
import { EmptyState } from "@/src/components/shared/EmptyState";
import { useAuth } from "@/src/context/AuthContext";
import { observePatientConnection } from "@/src/services/connectionService";
import { ConnectionStatus } from "@/src/types/database";
import { UserProfile } from "@/src/types/database";

export default function TherapistPatientDetailPage() {
  const params = useParams<{ patientId: string }>();
  const patientId = params?.patientId ?? "";
  const { user } = useAuth();
  return <PatientDetail key={`${user?.uid}:${patientId}`} patientId={patientId} therapistId={user?.uid ?? ""} />;
}

function PatientDetail({ patientId, therapistId }: { patientId: string; therapistId: string }) {
  const [patient, setPatient] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!patientId) {
      return;
    }

    let active = true;
    const unsubscribe = observePatientConnection(patientId, async (connection) => {
      const allowed = connection?.therapistId === therapistId && connection?.status === ConnectionStatus.ACTIVE;
      if (!active) return;
      setConnected(allowed);
      if (!allowed) { setPatient(null); setLoading(false); return; }
      try {
        const profile = await getUserProfile(patientId);
        if (active) { setPatient(profile); setError(!profile); }
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    }, () => { if (active) { setError(true); setLoading(false); } });
    return () => { active = false; unsubscribe(); };
  }, [patientId, therapistId]);

  if (loading && patientId) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Spinner label="Loading patient" /></div>;
  }

  if (error || !patient || !connected) return <EmptyState icon="person_off" title="This patient isn’t available" description="We couldn’t open an active connection for this profile. Return to your roster to view the patients currently in your care." href="/patients" action="Back to my patients" />;

  const patientName = patient?.displayName || `Patient ${patientId.slice(0, 8)}`;

  return (
    <div className="space-y-6 font-['Plus_Jakarta_Sans'] text-[#2c1601]">
      <header className="rounded-[2.5rem] border border-white/80 bg-[#c6ebda]/70 p-7 shadow-[0_20px_40px_-20px_rgba(74,107,94,0.22),inset_0_2px_5px_rgba(255,255,255,0.75)] sm:p-9">
        <Link className="inline-flex items-center gap-1 rounded-full bg-white/65 px-3 py-1.5 text-sm font-medium text-[#325347] transition hover:bg-white" href="/patients"><span aria-hidden="true" className="material-symbols-outlined text-base">arrow_back</span> Roster</Link>
        <p className="mt-6 text-xs font-medium uppercase tracking-[0.14em] text-[#2d4d41]/70">Patient profile</p>
        <h1 className="mt-2 text-3xl font-medium tracking-[-0.03em] text-[#325347] sm:text-4xl">{patientName}</h1>
        <p className="mt-3 text-sm font-light leading-6 text-[#2d4d41]/80">Keep your connection close. Journal entries and mood check-ins are private to this patient.</p>
      </header>

      <section className="rounded-[2.5rem] border border-white/80 bg-white/75 p-6 shadow-[0_20px_40px_-20px_rgba(121,88,65,0.2),inset_0_2px_4px_rgba(255,255,255,0.85)] sm:p-8">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="rounded-[1.75rem] bg-[#fff1e8] p-5 shadow-[inset_0_3px_8px_rgba(44,22,1,0.035)]"><p className="text-xs font-medium uppercase tracking-[0.12em] text-[#795841]/70">Connection</p><p className="mt-2 text-lg font-medium text-[#795841]">Active care relationship</p></div>
          <div className="rounded-[1.75rem] bg-[#fff1e8] p-5 shadow-[inset_0_3px_8px_rgba(44,22,1,0.035)]"><p className="text-xs font-medium uppercase tracking-[0.12em] text-[#795841]/70">Profile</p><p className="mt-2 text-lg font-medium text-[#795841]">{patient?.isIncognito ? "Incognito profile" : "Standard profile"}</p></div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="rounded-full bg-[#325347] px-5 py-3 text-sm font-medium text-white shadow-[0_8px_16px_-6px_rgba(50,83,71,0.3),inset_0_1px_0_rgba(255,255,255,0.4)] transition hover:bg-[#4a6b5e] active:scale-95" href={`/messages/${patientId}`}>Open messages</Link>
          <Link className="rounded-full bg-[#fff1e8] px-5 py-3 text-sm font-medium text-[#325347] transition hover:bg-[#ffe3cd] active:scale-95" href="/patients">Back to roster</Link>
        </div>
      </section>
    </div>
  );
}
