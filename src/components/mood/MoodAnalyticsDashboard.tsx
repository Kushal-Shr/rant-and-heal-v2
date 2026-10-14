"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Card } from "@/src/components/ui/Card";
import { MoodTrend } from "@/src/components/shared/MoodTrend";
import type { MoodEntry } from "@/src/types/database";
import {
  calculateContextPatterns, calculateHelpfulFactorPatterns, calculateMetricAssociation,
  calculateTimeOfDayPatterns, calculateWeeklySnapshot, entriesWithinDays,
  moodEntryDate, weeklyComparisonText, type MoodMetricKey,
} from "@/src/lib/mood/analytics";
import { friendlyTag } from "@/src/lib/mood/schema";

const comparisonOptions: { value: "" | Exclude<MoodMetricKey, "moodScore">; label: string }[] = [
  { value: "", label: "Mood only" }, { value: "stressScore", label: "Mood + stress" },
  { value: "energyScore", label: "Mood + energy" }, { value: "sleepQualityScore", label: "Mood + sleep" },
  { value: "anxietyScore", label: "Mood + tension" }, { value: "focusScore", label: "Mood + focus" },
];
const latestMetrics: { key: Exclude<MoodMetricKey, "moodScore">; label: string }[] = [
  { key: "energyScore", label: "Energy" }, { key: "stressScore", label: "Stress" },
  { key: "anxietyScore", label: "Tension" }, { key: "sleepQualityScore", label: "Sleep" },
  { key: "focusScore", label: "Focus" }, { key: "socialConnectionScore", label: "Connection" },
  { key: "physicalWellbeingScore", label: "Physical wellbeing" },
];

const panel = "min-w-0 !rounded-[2rem] !bg-white/80 p-5 sm:p-7";
const eyebrow = "text-[10px] font-semibold uppercase tracking-[0.18em] text-[#657267]";

function Icon({ name, className = "" }: { name: string; className?: string }) {
  return <span aria-hidden="true" className={`material-symbols-outlined ${className}`}>{name}</span>;
}

function CompactStat({ label, value, suffix, icon }: { label: string; value: string | number; suffix?: string; icon: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-[#eceee5] bg-[#f8f9f4] p-4">
      <div className="mb-4 flex items-center gap-2 text-[#657267]"><Icon className="!text-lg" name={icon} /><p className="text-xs">{label}</p></div>
      <p className={`${typeof value === "number" ? "text-3xl" : "text-lg"} font-medium tracking-tight text-[#325347]`}>{value}{suffix ? <span className="ml-1 text-sm font-normal text-[#657267]">{suffix}</span> : null}</p>
    </div>
  );
}

function PatternCard({ title, icon, tone, children }: { title: string; icon: string; tone: string; children: ReactNode }) {
  return (
    <article className="flex gap-4 rounded-3xl border border-[#e7e8df] bg-white/65 p-5 sm:p-6">
      <span className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${tone}`}><Icon className="!text-xl" name={icon} /></span>
      <div className="min-w-0"><h3 className="font-medium text-[#325347]">{title}</h3><div className="mt-2 text-sm leading-6 text-[#657267]">{children}</div></div>
    </article>
  );
}

export function MoodAnalyticsDashboard({ entries, isLoading }: { entries: MoodEntry[]; isLoading?: boolean }) {
  const [rangeDays, setRangeDays] = useState<7 | 30 | 90>(30);
  const [comparisonMetric, setComparisonMetric] = useState<"" | Exclude<MoodMetricKey, "moodScore">>("");
  const latest = useMemo(() => entries.slice().sort((a, b) => (moodEntryDate(b)?.getTime() ?? 0) - (moodEntryDate(a)?.getTime() ?? 0))[0], [entries]);
  const latestOptional = latestMetrics.filter(({ key }) => typeof latest?.[key] === "number");
  const weekly = useMemo(() => calculateWeeklySnapshot(entries), [entries]);
  const recent = useMemo(() => entriesWithinDays(entries, 30), [entries]);
  const contexts = useMemo(() => calculateContextPatterns(recent), [recent]);
  const helpful = useMemo(() => calculateHelpfulFactorPatterns(recent), [recent]);
  const timePatterns = useMemo(() => calculateTimeOfDayPatterns(recent), [recent]);
  const sleepAssociation = useMemo(() => calculateMetricAssociation(recent, "sleepQualityScore"), [recent]);
  const comparisonText = weeklyComparisonText(weekly.comparison);
  const latestDate = latest ? moodEntryDate(latest) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 px-1 pt-3"><h2 className="shrink-0 text-lg font-medium tracking-tight text-[#325347]">Your recent rhythm</h2><div aria-hidden="true" className="h-px flex-1 bg-[#dfe4da]" /><span className="text-xs text-[#657267]">One check-in at a time</span></div>

      <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
        <Card className={panel} padding="none">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><p className={eyebrow}>The bigger picture</p><h3 className="mt-2 text-2xl font-medium tracking-tight text-[#325347]">Mood over time</h3></div>
            <div className="inline-flex rounded-full bg-[#f0f2eb] p-1" aria-label="Mood trend time range">
              {([7, 30, 90] as const).map((days) => <button aria-pressed={rangeDays === days} className={`min-h-11 rounded-full px-3.5 text-xs font-medium transition sm:px-4 ${rangeDays === days ? "bg-white text-[#325347] shadow-[0_2px_6px_#32534718]" : "text-[#657267] hover:text-[#325347]"}`} key={days} onClick={() => setRangeDays(days)} type="button">{days} days</button>)}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#eceee5] pt-4">
            <p className="text-xs text-[#657267]">A little perspective on how you&apos;ve felt.</p>
            <label className="text-xs text-[#596c60]"><span className="sr-only">Compare mood with another metric</span><select className="min-h-11 max-w-full rounded-xl border border-[#e3e7dd] bg-[#fafbf7] px-3 text-[#414845]" onChange={(event) => setComparisonMetric(event.target.value as typeof comparisonMetric)} value={comparisonMetric}>{comparisonOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          </div>
          {isLoading ? <div className="flex min-h-64 items-center justify-center text-sm text-[#596c60]" role="status">Loading your check-ins…</div> : <MoodTrend comparisonMetric={comparisonMetric || undefined} entries={entries} rangeDays={rangeDays} />}
        </Card>

        <Card className="min-w-0 !rounded-[2rem] !bg-[#e5eddf] p-5 sm:p-7" padding="none" variant="sage">
          <div className="flex items-center justify-between gap-3"><p className={eyebrow}>Your latest moment</p><Icon className="!text-xl text-[#68816b]" name="eco" /></div>
          <h3 className="mt-2 text-xl font-medium tracking-tight text-[#325347]">Latest check-in</h3>
          {isLoading ? <p className="py-8 text-sm text-[#596c60]">Loading your latest check-in…</p> : latest ? <>
            <div className="mt-5 flex items-center gap-4">
              <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-white/60 shadow-[inset_0_2px_4px_white]"><Icon className="!text-4xl text-[#5a795c]" name={latest.moodScore >= 7 ? "sentiment_satisfied" : latest.moodScore >= 5 ? "sentiment_neutral" : "sentiment_dissatisfied"} /></span>
              <div><p className="text-4xl font-medium tracking-tight text-[#325347]">{latest.moodScore}<span className="ml-1 text-base font-normal text-[#657267]">/10</span></p><p className="mt-1 text-xs text-[#526753]">{latestDate?.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p></div>
            </div>
            {latestOptional.length ? <dl className="mt-5 divide-y divide-[#cddac6]">{latestOptional.map(({ key, label }) => <div className="flex items-center justify-between gap-3 py-2.5 text-xs" key={key}><dt className="text-[#526753]">{label}</dt><dd className="flex items-center gap-3 font-medium text-[#325347]"><span aria-hidden="true" className="h-1.5 w-12 overflow-hidden rounded-full bg-white/70"><span className="block h-full rounded-full bg-[#87a17b]" style={{ width: `${latest[key]! * 10}%` }} /></span>{latest[key]}<span className="-ml-2 text-[#657267]">/10</span></dd></div>)}</dl> : null}
            {latest.contexts?.length ? <div className="mt-4 flex flex-wrap gap-1.5">{latest.contexts.slice(0, 5).map((tag) => <span className="rounded-full border border-white/50 bg-white/45 px-2.5 py-1.5 text-[11px] text-[#526753]" key={tag}>{friendlyTag(tag)}</span>)}</div> : null}
          </> : <p className="my-7 text-sm leading-6 text-[#526753]">A small pause, a little self-kindness. Your first check-in will find a home here.</p>}
          <a className="mt-5 flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#b7c9af] bg-white/40 px-4 py-3 text-sm font-medium text-[#325347] transition hover:bg-white/80" href="#check-in">{latest ? "Check in again" : "Take a moment"}<Icon className="!text-base" name="arrow_forward" /></a>
        </Card>
      </section>

      <Card className={panel} padding="none">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className={eyebrow}>The last 7 days</p><h3 className="mt-2 text-2xl font-medium tracking-tight text-[#325347]">Your week at a glance</h3></div><span className="inline-flex items-center gap-2 rounded-full bg-[#f0f3eb] px-3 py-2 text-xs text-[#526753]"><Icon className="!text-base" name="calendar_today" />{weekly.checkIns} check-in{weekly.checkIns === 1 ? "" : "s"} · {weekly.daysCheckedIn} day{weekly.daysCheckedIn === 1 ? "" : "s"}</span></div>
        {isLoading ? <p className="py-8 text-sm text-[#657267]">Loading your week…</p> : weekly.checkIns ? <>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-2 xl:grid-cols-3">
            <CompactStat icon="sentiment_satisfied" label="Average mood" suffix="/10" value={weekly.averageMood ?? "—"} />
            {weekly.averageStress !== null ? <CompactStat icon="waves" label="Average stress" suffix="/10" value={weekly.averageStress} /> : null}
            {weekly.averageEnergy !== null ? <CompactStat icon="bolt" label="Average energy" suffix="/10" value={weekly.averageEnergy} /> : null}
            {weekly.variability ? <CompactStat icon="equalizer" label="Mood felt" value={weekly.variability.label} /> : null}
            {weekly.highest ? <CompactStat icon="north_east" label="Highest check-in" value={weekly.highest.date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} /> : null}
            {weekly.lowest ? <CompactStat icon="south_east" label="Lowest check-in" value={weekly.lowest.date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} /> : null}
          </div>
          <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-[#657267]"><Icon className="!text-base" name="auto_awesome" />{comparisonText ?? "As you check in over time, a week-to-week reflection will appear here."}</p>
        </> : <p className="mt-5 rounded-2xl bg-[#f6f7f1] p-5 text-sm leading-6 text-[#657267]">A few check-ins will help patterns start to appear. There&apos;s no schedule to keep.</p>}
      </Card>

      <section aria-labelledby="patterns-heading" className="pt-3">
        <div className="mb-5 px-1"><p className={eyebrow}>Connections · Last 30 days</p><h2 className="mt-2 text-2xl font-medium tracking-tight text-[#325347]" id="patterns-heading">Little things you might notice</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#657267]">What shows up alongside your moods, as your story unfolds.</p></div>
        <div className="grid gap-4 min-[1100px]:grid-cols-2">
          <PatternCard icon="label" title="What’s been on your mind" tone="bg-[#eee8db] text-[#847152]">{contexts[0] ? <p><strong className="font-medium text-[#325347]">{friendlyTag(contexts[0].tag)}</strong> appeared in {contexts[0].count} check-ins, with an average mood of {contexts[0].averageMood}/10.</p> : <p>Choose a few influences when you check in. Recurring themes will appear here.</p>}</PatternCard>
          <PatternCard icon="spa" title="What seems to help" tone="bg-[#f5e3d6] text-[#946a4d]">{helpful[0] ? <p><strong className="font-medium text-[#325347]">{friendlyTag(helpful[0].tag)}</strong> appeared in {helpful[0].count} check-ins with an average mood of {helpful[0].averageMood}/10.</p> : <p>Music, a walk, a good conversation. Keep a little record of what helps.</p>}</PatternCard>
          <PatternCard icon="schedule" title="Your daily rhythm" tone="bg-[#e4ecd9] text-[#637c53]">{timePatterns.length >= 2 && timePatterns[0].averageMood - timePatterns.at(-1)!.averageMood >= 0.5 ? <p>Your <strong className="font-medium text-[#325347]">{timePatterns[0].period}</strong> check-ins have tended to be higher than your {timePatterns.at(-1)!.period} check-ins.</p> : <p>A few more morning, afternoon, or evening check-ins may reveal a rhythm.</p>}</PatternCard>
          <PatternCard icon="bedtime" title="Rest and how you feel" tone="bg-[#ece7f0] text-[#7a698a]">{sleepAssociation && Math.abs(sleepAssociation.difference) >= 0.5 ? <p>Higher sleep-quality check-ins have often occurred alongside {sleepAssociation.difference > 0 ? "higher" : "lower"} mood ratings.</p> : <p>Include sleep quality whenever you like to explore how rest and mood line up.</p>}</PatternCard>
        </div>
        <p className="mt-4 px-1 text-xs leading-5 text-[#657267]">Based on what you choose to share. These are associations, not advice or a clinical assessment. Patterns appear only when enough check-ins support them.</p>
      </section>
    </div>
  );
}
