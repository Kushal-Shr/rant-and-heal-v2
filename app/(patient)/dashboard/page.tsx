"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/src/components/ui/Card";
import { Spinner } from "@/src/components/ui/Spinner";
import { MomoPortrait } from "@/src/components/shared/MomoPortrait";
import { MoodCheckInForm } from "@/src/components/mood/MoodCheckInForm";
import { MoodAnalyticsDashboard } from "@/src/components/mood/MoodAnalyticsDashboard";
import { useAuth } from "@/src/context/AuthContext";
import { listRecentJournalMetrics } from "@/src/services/journalService";
import { listMoodEntriesInRange } from "@/src/services/moodService";
import type { MoodEntry } from "@/src/types/database";
import type { JournalMetric } from "@/src/lib/journal/schemas";

const quickActions = [
  { href: "/momo", icon: "mic", label: "Rant now", className: "bg-[#ffdad6] text-[#ba1a1a]" },
  { href: "/vault", icon: "edit_document", label: "Journal", className: "bg-[#4a6b5e] text-white" },
  { href: "#check-in", icon: "self_improvement", label: "Check in", className: "bg-[#ffe3cd] text-[#793b26]" },
  { href: "/therapy", icon: "psychology", label: "Find support", className: "bg-[#ffdcbf] text-[#414845]" },
] as const;

function firstName(displayName: string | null | undefined) {
  const name = displayName?.trim();
  return name ? name.split(/\s+/)[0] : "there";
}

export default function PatientDashboardPage() {
  const { user, loading } = useAuth();
  const [moodEntries, setMoodEntries] = useState<MoodEntry[]>([]);
  const [journalMetrics, setJournalMetrics] = useState<JournalMetric[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [loadMessage, setLoadMessage] = useState<string | null>(null);

  const refreshDashboard = useCallback(async () => {
    if (!user) return;
    setIsFetching(true);
    const [moods, journals] = await Promise.allSettled([
      listMoodEntriesInRange(user.uid, 90),
      listRecentJournalMetrics(user.uid, 3),
    ]);
    if (moods.status === "fulfilled") setMoodEntries(moods.value);
    if (journals.status === "fulfilled") setJournalMetrics(journals.value);
    if (moods.status === "rejected" || journals.status === "rejected") {
      console.error("Failed to load dashboard sources", {
        moodCheckInsFailed: moods.status === "rejected",
        journalMetricsFailed: journals.status === "rejected",
      });
      setLoadMessage("Some recent activity is temporarily unavailable.");
    } else {
      setLoadMessage(null);
    }
    setIsFetching(false);
  }, [user]);

  useEffect(() => {
    if (!loading && user) void Promise.resolve().then(refreshDashboard);
  }, [loading, user, refreshDashboard]);

  if (loading) return <div className="flex min-h-[70vh] items-center justify-center"><Spinner label="Loading dashboard" size="lg" /></div>;
  if (!user) return null;

  return (
    <div className="min-w-0">
      <div className="mx-auto max-w-6xl space-y-6 pb-10">
        <section className="relative overflow-hidden rounded-[2.5rem] border border-white/70 bg-[#fed1b4]/90 px-6 py-8 shadow-[0_20px_40px_-18px_rgba(121,88,65,0.2),inset_0_2px_4px_rgba(255,255,255,0.6)] sm:px-10 sm:py-10">
          <div aria-hidden="true" className="absolute -bottom-20 -right-10 size-56 rounded-full bg-[#ffdcc6]/80 blur-2xl" />
          <div className="relative max-w-3xl sm:pr-32"><p className="text-sm font-medium uppercase tracking-[0.12em] text-[#795841]/70">A gentle beginning</p><h1 className="mt-3 text-3xl font-medium tracking-[-0.03em] text-[#785741] sm:text-5xl">Hey {firstName(user.displayName)}, you showed up today.</h1><p className="mt-4 max-w-2xl text-base font-light leading-7 text-[#795841]/80 sm:text-lg">Take a quick check-in, or look back at the patterns you chose to record.</p></div>
          <MomoPortrait className="absolute right-8 top-1/2 hidden size-28 -translate-y-1/2 sm:block" />
        </section>

        {loadMessage ? <p className="rounded-2xl bg-[#ffdad6] px-4 py-3 text-sm text-[#93000a]" role="status">{loadMessage}</p> : null}

        <Card className="scroll-mt-6 p-6 sm:p-8" id="check-in" padding="none"><MoodCheckInForm onSaved={refreshDashboard} uid={user.uid} /></Card>

        <MoodAnalyticsDashboard entries={moodEntries} isLoading={isFetching} />

        <section className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
          <div className="grid grid-cols-2 gap-4">
            {quickActions.map((action) => <Link className="group flex min-h-32 flex-col items-center justify-center rounded-[2rem] border border-white/70 bg-white/45 p-5 text-center shadow-[0_15px_30px_-18px_rgba(121,88,65,0.2),inset_0_2px_4px_rgba(255,255,255,0.65)] transition-all hover:-translate-y-1 hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#325347] active:scale-[0.97]" href={action.href} key={action.label}><span className={`mb-3 flex size-12 items-center justify-center rounded-full ${action.className}`}><span aria-hidden="true" className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>{action.icon}</span></span><span className="text-sm font-medium text-[#2c1601]">{action.label}</span></Link>)}
          </div>

          <Card className="p-6 sm:p-8" padding="none" variant="peach">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-[0.12em] text-[#795841]/70">Private writing</p><h2 className="mt-2 text-2xl font-medium text-[#795841]">Recent journal activity</h2></div><Link className="min-h-11 rounded-full bg-white/65 px-4 py-3 text-sm font-medium text-[#795841] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#795841]" href="/vault">Open Vault</Link></div>
            <div className="mt-6 space-y-3">{journalMetrics.length > 0 ? journalMetrics.map((entry) => <article className="rounded-[1.5rem] bg-white/70 p-4" key={entry.id}><div className="flex items-start justify-between gap-3"><h3 className="font-medium text-[#2c1601]">Encrypted journal entry</h3><span className="rounded-full bg-[#ffdcc6] px-2.5 py-1 text-xs text-[#795841]">{entry.behavior.lengthBucket.toLowerCase()}</span></div><p className="mt-2 text-sm leading-6 text-[#414845]">{entry.behavior.timeOfDay.toLowerCase().replace("_", " ")} · {entry.userReported?.emotions?.length ?? 0} optional emotion labels</p></article>) : <p className="rounded-[1.5rem] bg-white/70 p-5 text-sm leading-6 text-[#795841]">Nothing written yet. Your encrypted journal is here whenever words arrive.</p>}</div>
            <p className="mt-4 text-xs leading-5 text-[#795841]/75">This card uses activity metadata only. Mood notes remain separate from your encrypted journal.</p>
          </Card>
        </section>
      </div>
    </div>
  );
}
