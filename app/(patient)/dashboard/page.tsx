"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Textarea } from "@/src/components/forms/Textarea";
import { Button } from "@/src/components/ui/Button";
import { Card } from "@/src/components/ui/Card";
import { Spinner } from "@/src/components/ui/Spinner";
import { useAuth } from "@/src/context/AuthContext";
import { listJournalEntries } from "@/src/services/journalService";
import { createMoodEntry, listMoodEntries } from "@/src/services/moodService";
import { JournalEntry, MoodEntry } from "@/src/types/database";

import { MoodTrend } from "@/src/components/shared/MoodTrend";
import { MomoPortrait } from "@/src/components/shared/MomoPortrait";

const scoreFields = [
  { key: "moodScore", label: "Mood", accent: "bg-[#abcebf]" },
  { key: "anxietyScore", label: "Anxiety", accent: "bg-[#fed1b4]" },
  { key: "energyScore", label: "Energy", accent: "bg-[#e9bea2]" },
] as const;

const moodChoices = [
  { score: 2, icon: "sentiment_very_dissatisfied", label: "Having a hard time", className: "bg-[#ffdad6] text-[#ba1a1a]" },
  { score: 4, icon: "sentiment_dissatisfied", label: "Low", className: "bg-[#ffdcbf] text-[#793b26]" },
  { score: 6, icon: "sentiment_neutral", label: "Steady", className: "bg-white text-[#785741]" },
  { score: 8, icon: "sentiment_satisfied", label: "Good", className: "bg-[#abcebf] text-[#325347]" },
  { score: 10, icon: "sentiment_very_satisfied", label: "Great", className: "bg-[#c6ebda] text-[#325347]" },
] as const;

const quickActions = [
  { href: "/momo/call", icon: "mic", label: "Rant now", className: "bg-[#ffdad6] text-[#ba1a1a]" },
  { href: "/vault", icon: "edit_document", label: "Journal", className: "bg-[#4a6b5e] text-white" },
  { href: "#check-in", icon: "self_improvement", label: "Check in", className: "bg-[#ffe3cd] text-[#793b26]" },
  { href: "/therapy", icon: "psychology", label: "Find support", className: "bg-[#ffdcbf] text-[#414845]" },
] as const;

type ScoreKey = (typeof scoreFields)[number]["key"];
type Scores = Record<ScoreKey, number>;

function isValidScore(value: number) {
  return Number.isInteger(value) && value >= 1 && value <= 10;
}

function firstName(displayName: string | null | undefined) {
  const name = displayName?.trim();
  return name ? name.split(/\s+/)[0] : "there";
}

export default function PatientDashboardPage() {
  const { user, loading } = useAuth();
  const [scores, setScores] = useState<Scores>({ moodScore: 6, anxietyScore: 4, energyScore: 5 });
  const [note, setNote] = useState("");
  const [moodEntries, setMoodEntries] = useState<MoodEntry[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  async function refreshDashboard(uid: string) {
    try {
      setIsFetching(true);
      const [moods, journals] = await Promise.all([listMoodEntries(uid, 7), listJournalEntries(uid)]);
      setMoodEntries(moods);
      setJournalEntries(journals.slice(0, 3));
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
      setFeedback({ type: "error", message: "Could not load your latest entries." });
    } finally {
      setIsFetching(false);
    }
  }

  useEffect(() => {
    if (!loading && user) {
      void Promise.resolve().then(() => refreshDashboard(user.uid));
    }
  }, [loading, user]);

  const averages = useMemo(() => {
    if (moodEntries.length === 0) return null;

    return scoreFields.map((field) => {
      const total = moodEntries.reduce((sum, entry) => sum + entry[field.key], 0);
      return { ...field, value: Math.round((total / moodEntries.length) * 10) / 10 };
    });
  }, [moodEntries]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    if (!scoreFields.every((field) => isValidScore(scores[field.key]))) {
      setFeedback({ type: "error", message: "Scores need to be whole numbers from 1 to 10." });
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      await createMoodEntry(user.uid, { ...scores, note });
      setNote("");
      setFeedback({ type: "success", message: "Your check-in is safely saved." });
      await refreshDashboard(user.uid);
    } catch (error) {
      console.error("Failed to save mood entry:", error);
      setFeedback({ type: "error", message: "Could not save that check-in. Try again." });
    } finally {
      setIsSaving(false);
    }
  }

  if (loading) {
    return <div className="flex min-h-[70vh] items-center justify-center"><Spinner size="lg" label="Loading dashboard" /></div>;
  }

  if (!user) return null;

  return (
    <div className="min-w-0">


      <div className="mx-auto max-w-6xl space-y-6 pb-10">
        <section className="relative overflow-hidden rounded-[2.5rem] border border-white/70 bg-[#fed1b4]/90 px-6 py-8 shadow-[0_20px_40px_-18px_rgba(121,88,65,0.2),inset_0_2px_4px_rgba(255,255,255,0.6)] sm:px-10 sm:py-10">
          <div aria-hidden="true" className="absolute -bottom-20 -right-10 size-56 rounded-full bg-[#ffdcc6]/80 blur-2xl" />
          <div className="relative max-w-3xl sm:pr-32">
            <p className="text-sm font-medium uppercase tracking-[0.12em] text-[#795841]/70">A gentle beginning</p>
            <h1 className="mt-3 text-3xl font-medium tracking-[-0.03em] text-[#785741] sm:text-5xl">Hey {firstName(user.displayName)}, you showed up today.</h1>
            <p className="mt-4 max-w-2xl text-base font-light leading-7 text-[#795841]/80 sm:text-lg">That&apos;s something to be proud of. Take a breath, then choose what feels useful.</p>
          </div>
          <MomoPortrait className="absolute right-8 top-1/2 hidden size-28 -translate-y-1/2 sm:block" />
        </section>

        <Card className="scroll-mt-6 p-6 sm:p-8" id="check-in" padding="none">
          <form onSubmit={handleSubmit}>
            <div className="text-center">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#4a6b5e]/70">Daily check-in</p>
              <h2 className="mt-2 text-2xl font-medium tracking-[-0.02em] text-[#325347] sm:text-3xl">How are you feeling right now?</h2>
            </div>

            <div aria-label="Choose your current mood" className="mx-auto mt-7 flex max-w-xl items-end justify-center gap-2 sm:gap-5">
              {moodChoices.map((choice) => {
                const isSelected = scores.moodScore === choice.score;
                return (
                  <button
                    aria-label={choice.label}
                    aria-pressed={isSelected}
                    className={`group flex size-12 items-center justify-center rounded-full border border-white/80 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#325347] focus-visible:ring-offset-4 focus-visible:ring-offset-[#fff8f5] active:scale-95 sm:size-16 ${choice.className} ${isSelected ? "-translate-y-2 scale-110 shadow-[0_12px_20px_-6px_rgba(44,22,1,0.25),inset_0_3px_7px_rgba(255,255,255,0.75)]" : "shadow-[0_8px_15px_-6px_rgba(44,22,1,0.18),inset_0_3px_7px_rgba(255,255,255,0.7)] hover:-translate-y-1 hover:scale-105"}`}
                    key={choice.score}
                    onClick={() => setScores((current) => ({ ...current, moodScore: choice.score }))}
                    type="button"
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-2xl sm:text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>{choice.icon}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-5 text-center text-sm text-[#414845]/70">{moodChoices.find((choice) => choice.score === scores.moodScore)?.label}</p>

            <div className="mt-8 grid gap-4 border-t border-[#ffeada] pt-6 xl:grid-cols-[1fr_1fr_1.2fr]">
              {scoreFields.slice(1).map((field) => (
                <label className="rounded-[1.5rem] bg-[#fff1e8] p-4 shadow-[inset_0_3px_8px_rgba(44,22,1,0.04)]" key={field.key}>
                  <span className="flex items-center justify-between text-sm font-medium text-[#414845]">{field.label}<strong className="text-[#325347]">{scores[field.key]}/10</strong></span>
                  <input aria-label={`${field.label} score`} className="mt-4 w-full accent-[#325347]" max={10} min={1} onChange={(event) => setScores((current) => ({ ...current, [field.key]: Number(event.target.value) }))} type="range" value={scores[field.key]} />
                </label>
              ))}
              <label className="rounded-[1.5rem] bg-[#fff1e8] p-4 shadow-[inset_0_3px_8px_rgba(44,22,1,0.04)]">
                <span className="text-sm font-medium text-[#414845]">A note, if you want one</span>
                <Textarea className="mt-2 min-h-20 rounded-[1rem] bg-white px-4 py-3 text-sm shadow-none" onChange={(event) => setNote(event.target.value)} placeholder="One honest sentence is enough." rows={2} value={note} />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
              {feedback ? <p className={`rounded-full px-4 py-2 text-sm ${feedback.type === "success" ? "bg-[#c6ebda] text-[#002117]" : "bg-[#ffdad6] text-[#93000a]"}`} role="status">{feedback.message}</p> : <span />}
              <Button isLoading={isSaving} type="submit">Save check-in</Button>
            </div>
          </form>
        </Card>

        <section className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr]">
          <div className="grid grid-cols-2 gap-4">
            {quickActions.map((action) => (
              <Link className="group flex min-h-36 flex-col items-center justify-center rounded-[2rem] border border-white/70 bg-white/45 p-5 text-center shadow-[0_15px_30px_-18px_rgba(121,88,65,0.2),inset_0_2px_4px_rgba(255,255,255,0.65)] transition-all hover:-translate-y-1 hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#325347] focus-visible:ring-offset-4 focus-visible:ring-offset-[#fff8f5] active:scale-[0.97]" href={action.href} key={action.label}>
                <span className={`mb-4 flex size-12 items-center justify-center rounded-full shadow-[inset_0_2px_4px_rgba(255,255,255,0.55)] ${action.className}`}><span aria-hidden="true" className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>{action.icon}</span></span>
                <span className="text-sm font-medium text-[#2c1601]">{action.label}</span>
              </Link>
            ))}
          </div>

          <Card className="min-h-72 p-6 sm:p-8" padding="none">
            <div className="flex items-center justify-between gap-4">
              <div><p className="text-xs font-medium uppercase tracking-[0.12em] text-[#4a6b5e]/70">Last seven check-ins</p><h2 className="mt-2 text-2xl font-medium text-[#325347]">Your recent rhythm</h2></div>
              <span aria-hidden="true" className="material-symbols-outlined text-[#4a6b5e]/60">monitoring</span>
            </div>
            {isFetching ? <div className="flex min-h-48 items-center justify-center"><Spinner label="Loading mood trend" /></div> : <MoodTrend entries={moodEntries} />}
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Card className="p-6 sm:p-8" padding="none" variant="solid">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-[0.12em] text-[#4a6b5e]/70">Your recent data</p><h2 className="mt-2 text-2xl font-medium text-[#325347]">Check-in snapshot</h2></div><span className="rounded-full bg-[#c6ebda] px-3 py-1 text-xs font-medium text-[#002117]">{moodEntries.length} entries</span></div>
            {averages ? <div className="mt-6 grid gap-3 xl:grid-cols-3">{averages.map((item) => <div className="rounded-[1.5rem] bg-[#fff1e8] p-4" key={item.key}><p className="text-sm text-[#414845]/70">{item.label}</p><p className="mt-2 text-3xl font-medium text-[#325347]">{item.value}<span className="text-base">/10</span></p><div className="mt-3 h-2 overflow-hidden rounded-full bg-white"><div className={`h-full rounded-full ${item.accent}`} style={{ width: `${item.value * 10}%` }} /></div></div>)}</div> : <p className="mt-6 text-sm leading-6 text-[#414845]/75">Your first check-in will make this space yours.</p>}
          </Card>

          <Card className="p-6 sm:p-8" padding="none" variant="peach">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-[0.12em] text-[#795841]/70">Private writing</p><h2 className="mt-2 text-2xl font-medium text-[#795841]">Recent journal notes</h2></div><Link className="rounded-full bg-white/65 px-4 py-2 text-sm font-medium text-[#795841] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#795841]" href="/vault">Open journal</Link></div>
            <div className="mt-6 space-y-3">
              {journalEntries.length > 0 ? journalEntries.map((entry) => <article className="rounded-[1.5rem] bg-white/70 p-4" key={entry.id}><div className="flex items-start justify-between gap-3"><h3 className="font-medium text-[#2c1601]">{entry.title}</h3>{entry.moodTag ? <span className="rounded-full bg-[#ffdcc6] px-2.5 py-1 text-xs text-[#795841]">{entry.moodTag}</span> : null}</div><p className="mt-2 line-clamp-2 text-sm leading-6 text-[#414845]">{entry.body}</p></article>) : <p className="rounded-[1.5rem] bg-white/70 p-5 text-sm leading-6 text-[#795841]">Nothing written yet. Your journal is here whenever words arrive.</p>}
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
