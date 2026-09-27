"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/src/components/ui/Badge";
import { Spinner } from "@/src/components/ui/Spinner";
import { useSafetyReviewerAccess } from "@/src/hooks/useSafetyReviewerAccess";
import { sortSafetyCases, type SafetyCase } from "@/src/lib/safety/cases";
import { loadSafetyCases, observeSafetyCases } from "@/src/services/safetyCaseService";

function elapsed(value: string | null): string {
  if (!value) return "Time pending";
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60_000));
  if (minutes < 60) return `${minutes}m waiting`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h waiting` : `${Math.floor(hours / 24)}d waiting`;
}

function CaseCard({ item }: { item: SafetyCase }) {
  const urgencyVariant = item.reviewUrgency === "IMMEDIATE" ? "rose" : item.reviewUrgency === "URGENT" ? "peach" : "sage";
  return (
    <Link href={`/safety/${item.id}`} className="block rounded-[2rem] border border-white/80 bg-white/75 p-5 shadow-[0_14px_30px_-22px_rgba(50,83,71,.35)] transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#325347]">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={urgencyVariant}>{item.reviewUrgency} urgency</Badge>
        <Badge variant="clay">{item.status.replaceAll("_", " ")}</Badge>
        <Badge variant="moss">{item.currentState.replaceAll("_", " ")}</Badge>
      </div>
      <p className="mt-4 line-clamp-2 text-sm leading-6 text-[#414845]">{item.relevantUserText}</p>
      <div className="mt-4 flex flex-wrap justify-between gap-2 text-xs text-[#596c60]">
        <span>{item.status === "RESOLVED" ? "Resolved case" : elapsed(item.createdAt)}</span>
        <span>{item.assignedReviewerUid ? `Assigned: ${item.assignedReviewerUid}` : "Unassigned"}</span>
      </div>
    </Link>
  );
}

function QueueSection({ title, description, items }: { title: string; description: string; items: SafetyCase[] }) {
  return (
    <section aria-labelledby={title.toLowerCase().replaceAll(" ", "-")} className="clay-card p-6 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={title.toLowerCase().replaceAll(" ", "-")} className="text-xl font-medium text-[#325347]">{title}</h2>
          <p className="mt-1 text-sm text-[#596c60]">{description}</p>
        </div>
        <Badge variant="clay">{items.length} {items.length === 1 ? "case" : "cases"}</Badge>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {items.length ? items.map((item) => <CaseCard key={item.id} item={item} />) : (
          <p className="rounded-[1.75rem] bg-[#fff1e8] p-5 text-sm text-[#596c60] lg:col-span-2">No cases in this section.</p>
        )}
      </div>
    </section>
  );
}

export default function SafetyQueuePage() {
  const { user, loading: accessLoading, allowed } = useSafetyReviewerAccess();
  const [cases, setCases] = useState<SafetyCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (accessLoading) return;
    if (!user || !allowed) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    user.getIdToken().then(async (token) => {
      const initial = await loadSafetyCases(token);
      if (!active) return;
      setCases(initial);
      setLoading(false);
      unsubscribe = observeSafetyCases((items) => {
        setCases(items);
        setError(null);
      }, () => setError("Live updates are unavailable. Refresh to confirm the latest case state."));
    }).catch((reason) => {
      if (!active) return;
      setError(reason instanceof Error ? reason.message : "Could not load safety cases.");
      setLoading(false);
    });
    return () => { active = false; unsubscribe?.(); };
  }, [accessLoading, allowed, user]);

  const sections = useMemo(() => {
    const sorted = sortSafetyCases(cases);
    return {
      needsAcknowledgement: sorted.filter((item) => item.status === "OPEN"),
      assignedToMe: sorted.filter((item) => item.status !== "OPEN" && item.status !== "RESOLVED" && item.assignedReviewerUid === user?.uid),
      active: sorted.filter((item) => item.status !== "OPEN" && item.status !== "RESOLVED" && item.assignedReviewerUid !== user?.uid),
      resolved: sorted.filter((item) => item.status === "RESOLVED").slice(0, 20),
    };
  }, [cases, user?.uid]);

  if (accessLoading || (user && allowed && loading)) return <div className="flex min-h-[60vh] items-center justify-center"><Spinner label="Loading safety queue" /></div>;
  if (!user) return <div className="workspace"><p role="alert" className="clay-card p-7">Sign in to access the safety reviewer workspace.</p></div>;
  if (!allowed) return <div className="workspace"><p role="alert" className="rounded-[2rem] bg-[#ffdad6] p-7 text-[#93000a]">This account is not authorized as a safety reviewer. Therapist status alone does not grant access.</p></div>;

  return (
    <div className="workspace space-y-6 text-[#2c1601]">
      <header className="clay-page-header clay-page-header--sage">
        <div className="relative z-10">
          <p className="clay-eyebrow">Human safety operations</p>
          <h1 className="mt-2 text-3xl font-medium md:text-4xl">Safety review queue</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#2d4d41]">Backend-confirmed cases only. Opening or attempting contact never marks a person connected.</p>
        </div>
        <span aria-hidden="true" className="material-symbols-outlined relative z-10 text-5xl">health_and_safety</span>
      </header>
      {error ? <p role="alert" className="rounded-2xl bg-[#ffdad6] p-4 text-sm text-[#93000a]">{error}</p> : null}
      <QueueSection title="Needs acknowledgement" description="Open cases waiting for a reviewer acknowledgement." items={sections.needsAcknowledgement} />
      <QueueSection title="Assigned to me" description="Active cases currently owned by you." items={sections.assignedToMe} />
      <QueueSection title="Active" description="Acknowledged cases assigned elsewhere or not yet assigned." items={sections.active} />
      <QueueSection title="Recently resolved" description="Latest human-resolved cases for operational reference." items={sections.resolved} />
    </div>
  );
}
