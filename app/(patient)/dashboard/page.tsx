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
  { href: "/momo", icon: "mic", label: "Talk to Momo", description: "Let it out, at your pace", className: "bg-[#e0efe5] text-[#325347]" },
  { href: "/vault", icon: "edit_document", label: "Your journal", description: "A little room for words", className: "bg-[#ece4f3] text-[#69557e]" },
  { href: "#check-in", icon: "self_improvement", label: "Check in", description: "Notice how you feel", className: "bg-[#ffe3cd] text-[#793b26]" },
  { href: "/therapy", icon: "diversity_1", label: "Find support", description: "Connect with a therapist", className: "bg-[#f8e6c0] text-[#70592d]" },
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
        <section className="relative isolate overflow-hidden rounded-[2rem] border border-white bg-gradient-to-br from-[#f8e0ce] via-[#fcf0e5] to-[#e4efdf] px-6 py-7 shadow-[0_18px_45px_-28px_#79584165,inset_0_1px_2px_white] sm:px-8 sm:py-9">
          <div aria-hidden="true" className="absolute -right-12 -top-16 size-72 rounded-full border-[32px] border-white/25" />
          <div aria-hidden="true" className="absolute -bottom-24 right-32 size-64 rounded-full bg-[#ffe0bd]/60 blur-2xl" />
          <div className="relative flex items-center justify-between gap-5">
            <div className="min-w-0 max-w-2xl"><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#795841]">Your daily pause</p><h1 className="mt-3 text-3xl font-medium leading-[1.18] tracking-[-0.045em] text-[#325347] sm:text-4xl">A little space for you,<br /><span className="text-[#795841]">{firstName(user.displayName)}.</span></h1><p className="mt-4 max-w-md text-sm leading-6 text-[#526753]">Check in with yourself. Find a little perspective.<br className="hidden sm:block" /> Go at your own pace.</p><span className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/60 px-3 py-2 text-xs text-[#526753]"><span aria-hidden="true" className="material-symbols-outlined !text-base">spa</span>No perfect days needed.</span></div>
            <div className="relative shrink-0 self-start pt-1 sm:self-center sm:pr-6"><MomoPortrait className="size-20 ring-8 ring-white/35 sm:size-36 xl:size-44" priority /><span className="absolute -bottom-3 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-full border border-white bg-white/90 px-4 py-2 text-xs font-medium text-[#325347] shadow-sm sm:block">A softer place to land</span></div>
          </div>
        </section>

        <nav aria-label="Ways to care for yourself" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {quickActions.map((action) => <Link className="group flex min-w-0 items-center gap-3 rounded-3xl border border-white bg-white/75 p-4 shadow-[0_8px_24px_-16px_#79584145] transition hover:-translate-y-1 hover:bg-white hover:shadow-md motion-reduce:hover:translate-y-0" href={action.href} key={action.href}>{action.href === "/momo" ? <MomoPortrait className="size-11" /> : <span aria-hidden="true" className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${action.className}`}><span className="material-symbols-outlined !text-xl">{action.icon}</span></span>}<span className="min-w-0"><span className="block text-sm font-semibold text-[#325347]">{action.label}</span><span className="mt-1 hidden text-xs leading-5 text-[#657267] sm:block">{action.description}</span></span></Link>)}
        </nav>

        {loadMessage ? <p className="rounded-2xl bg-[#ffdad6] px-4 py-3 text-sm text-[#93000a]" role="status">{loadMessage}</p> : null}

        <Card className="scroll-mt-24 lg:scroll-mt-6 !rounded-[2rem] !bg-white/85 p-4 sm:p-8" id="check-in" padding="none"><MoodCheckInForm onSaved={refreshDashboard} uid={user.uid} /></Card>

        <MoodAnalyticsDashboard entries={moodEntries} isLoading={isFetching} />

        <section className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
          <Card className="flex flex-col items-start !rounded-[2rem] !bg-gradient-to-br !from-[#e3efdf] !to-[#f4f8ef] p-6 sm:p-7" padding="none"><MomoPortrait className="size-16" /><p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#657267]">A little company</p><h2 className="mt-2 text-2xl font-medium tracking-tight text-[#325347]">You can start anywhere.</h2><p className="mt-3 text-sm leading-7 text-[#526753]">A busy mind, a small win, or a day you can’t quite put into words. Momo is here to listen.</p><Link className="clay-link mt-6" href="/momo">Talk to Momo<span aria-hidden="true" className="material-symbols-outlined !text-lg">arrow_forward</span></Link></Card>

          <Card className="!rounded-[2rem] !border-[#eee2d4] !bg-[#f6eade] p-5 sm:p-7" padding="none" variant="peach">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-[0.12em] text-[#795841]/70">Private writing</p><h2 className="mt-2 text-2xl font-medium text-[#795841]">Recent journal activity</h2></div><Link className="min-h-11 rounded-full bg-white/65 px-4 py-3 text-sm font-medium text-[#795841] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#795841]" href="/vault">Open Vault</Link></div>
            <div className="mt-6 space-y-3">{journalMetrics.length > 0 ? journalMetrics.map((entry) => <article className="rounded-[1.5rem] bg-white/70 p-4" key={entry.id}><div className="flex items-start justify-between gap-3"><h3 className="font-medium text-[#2c1601]">Encrypted journal entry</h3><span className="rounded-full bg-[#ffdcc6] px-2.5 py-1 text-xs text-[#795841]">{entry.behavior.lengthBucket.toLowerCase()}</span></div><p className="mt-2 text-sm leading-6 text-[#414845]">{entry.behavior.timeOfDay.toLowerCase().replace("_", " ")} · {entry.userReported?.emotions?.length ?? 0} optional emotion labels</p></article>) : <p className="rounded-[1.5rem] bg-white/70 p-5 text-sm leading-6 text-[#795841]">Nothing written yet. Your encrypted journal is here whenever words arrive.</p>}</div>
            <p className="mt-4 text-xs leading-5 text-[#795841]">Your journal stays encrypted. Open your vault when you’re ready to revisit it.</p>
          </Card>
        </section>
      </div>
    </div>
  );
}
