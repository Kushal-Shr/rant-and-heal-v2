"use client";

import { useMemo, useState } from "react";
import { Card } from "@/src/components/ui/Card";
import { MoodTrend } from "@/src/components/shared/MoodTrend";
import type { MoodEntry } from "@/src/types/database";
import {
  calculateContextPatterns,
  calculateHelpfulFactorPatterns,
  calculateMetricAssociation,
  calculateTimeOfDayPatterns,
  calculateWeeklySnapshot,
  entriesWithinDays,
  moodEntryDate,
  weeklyComparisonText,
  type MoodMetricKey,
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

function dateLabel(entry: MoodEntry | undefined) {
  const date = entry ? moodEntryDate(entry) : null;
  return date?.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) ?? "";
}

function CompactStat({ label, value, suffix }: { label: string; value: string | number; suffix?: string }) {
  return <div className="rounded-[1.35rem] bg-[#fff1e8] p-4"><p className="text-xs text-[#596c60]">{label}</p><p className="mt-1 text-2xl font-medium text-[#325347]">{value}{suffix ? <span className="text-sm font-normal">{suffix}</span> : null}</p></div>;
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
  const timePatterns = useMemo(() => calculateTimeOfDayPatterns(entries), [entries]);
  const sleepAssociation = useMemo(() => calculateMetricAssociation(recent, "sleepQualityScore"), [recent]);
  const comparisonText = weeklyComparisonText(weekly.comparison);

  return (
    <div className="space-y-6">
      <section className="grid gap-6 lg:grid-cols-[0.75fr_1.25fr]">
        <Card className="p-6 sm:p-8" padding="none" variant="sage">
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-[0.12em] text-[#325347]/70">Today</p><h2 className="mt-2 text-2xl font-medium text-[#002117]">Latest check-in</h2></div><a className="min-h-11 rounded-full bg-white/65 px-4 py-3 text-sm font-medium text-[#325347] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#325347]" href="#check-in">{latest ? "Check in again" : "Check in"}</a></div>
          {latest ? <div className="mt-6"><div className="flex items-end gap-2"><span className="text-5xl font-medium text-[#325347]">{latest.moodScore}</span><span className="pb-1 text-sm text-[#325347]/75">/10 mood</span></div><p className="mt-2 text-sm text-[#325347]/75">{dateLabel(latest)}</p>{latestOptional.length ? <dl className="mt-5 grid grid-cols-2 gap-2">{latestOptional.map(({ key, label }) => <div className="rounded-2xl bg-white/55 p-3" key={key}><dt className="text-xs text-[#325347]/70">{label}</dt><dd className="mt-1 font-medium text-[#002117]">{latest[key]}/10</dd></div>)}</dl> : null}{latest.contexts?.length ? <div className="mt-4 flex flex-wrap gap-2">{latest.contexts.slice(0, 5).map((tag) => <span className="rounded-full bg-white/60 px-3 py-1.5 text-xs text-[#325347]" key={tag}>{friendlyTag(tag)}</span>)}</div> : null}</div> : <div className="mt-6 rounded-[1.5rem] bg-white/55 p-5 text-sm leading-6 text-[#325347]">Your first check-in will appear here. Mood is the only required answer.</div>}
        </Card>

        <Card className="min-h-80 p-6 sm:p-8" padding="none">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div><p className="text-xs font-medium uppercase tracking-[0.12em] text-[#4a6b5e]/70">Your observed check-ins</p><h2 className="mt-2 text-2xl font-medium text-[#325347]">Mood over time</h2></div>
            <div className="flex flex-wrap gap-2" aria-label="Mood trend time range">{([7, 30, 90] as const).map((days) => <button aria-pressed={rangeDays === days} className={`min-h-11 rounded-full px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#325347] ${rangeDays === days ? "bg-[#325347] text-white" : "bg-[#fff1e8] text-[#596c60]"}`} key={days} onClick={() => setRangeDays(days)} type="button">{days} days</button>)}</div>
          </div>
          <label className="mt-4 block text-sm text-[#596c60] sm:ml-auto sm:max-w-56"><span className="sr-only">Compare mood with another metric</span><select className="min-h-11 w-full rounded-full border border-[#e7d8ce] bg-white px-4 text-[#414845] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#325347]" onChange={(event) => setComparisonMetric(event.target.value as typeof comparisonMetric)} value={comparisonMetric}>{comparisonOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          {isLoading ? <div className="flex min-h-52 items-center justify-center text-sm text-[#596c60]">Loading your check-ins…</div> : <MoodTrend comparisonMetric={comparisonMetric || undefined} entries={entries} rangeDays={rangeDays} />}
        </Card>
      </section>

      <Card className="p-6 sm:p-8" padding="none" variant="solid">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-[0.12em] text-[#4a6b5e]/70">This week</p><h2 className="mt-2 text-2xl font-medium text-[#325347]">A gentle snapshot</h2></div><span className="rounded-full bg-[#c6ebda] px-3 py-1.5 text-xs font-medium text-[#002117]">{weekly.checkIns} check-in{weekly.checkIns === 1 ? "" : "s"} · {weekly.daysCheckedIn} day{weekly.daysCheckedIn === 1 ? "" : "s"}</span></div>
        {weekly.checkIns ? <><div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><CompactStat label="Average mood" suffix="/10" value={weekly.averageMood ?? "—"} />{weekly.averageStress !== null ? <CompactStat label="Average stress" suffix="/10" value={weekly.averageStress} /> : null}{weekly.averageEnergy !== null ? <CompactStat label="Average energy" suffix="/10" value={weekly.averageEnergy} /> : null}{weekly.variability ? <CompactStat label="Mood felt" value={weekly.variability.label} /> : null}{weekly.highest ? <CompactStat label="Highest check-in" value={weekly.highest.date.toLocaleDateString(undefined, { weekday: "short" })} /> : null}{weekly.lowest ? <CompactStat label="Lowest check-in" value={weekly.lowest.date.toLocaleDateString(undefined, { weekday: "short" })} /> : null}</div>{comparisonText ? <p className="mt-5 rounded-2xl bg-[#f6fbf8] p-4 text-sm leading-6 text-[#325347]">{comparisonText}</p> : <p className="mt-5 text-sm text-[#596c60]">With four check-ins in each week, a week-to-week comparison can appear here.</p>}</> : <p className="mt-6 rounded-[1.5rem] bg-[#fff1e8] p-5 text-sm leading-6 text-[#596c60]">A few check-ins will help patterns start to appear.</p>}
      </Card>

      <section aria-labelledby="patterns-heading">
        <div className="mb-4"><p className="text-xs font-medium uppercase tracking-[0.12em] text-[#4a6b5e]/70">Last 30 days</p><h2 className="mt-2 text-2xl font-medium text-[#325347]" id="patterns-heading">What has shown up alongside your moods?</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[#596c60]">These are simple associations from what you chose to record, not advice or a clinical assessment. A pattern needs at least three relevant check-ins before it appears.</p></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="p-5" padding="none"><span aria-hidden="true" className="material-symbols-outlined text-[#4a6b5e]">label</span><h3 className="mt-3 font-medium text-[#325347]">Frequent context</h3>{contexts[0] ? <p className="mt-3 text-sm leading-6 text-[#596c60]"><strong className="text-[#414845]">{friendlyTag(contexts[0].tag)}</strong> appeared in {contexts[0].count} check-ins, with an average mood of {contexts[0].averageMood}/10.</p> : <p className="mt-3 text-sm leading-6 text-[#596c60]">No context has appeared in three check-ins yet.</p>}</Card>
          <Card className="p-5" padding="none" variant="peach"><span aria-hidden="true" className="material-symbols-outlined text-[#795841]">spa</span><h3 className="mt-3 font-medium text-[#795841]">What seems to help</h3>{helpful[0] ? <p className="mt-3 text-sm leading-6 text-[#795841]"><strong>{friendlyTag(helpful[0].tag)}</strong> appeared in {helpful[0].count} check-ins with an average mood of {helpful[0].averageMood}/10.</p> : <p className="mt-3 text-sm leading-6 text-[#795841]">Helpful-factor patterns will appear after three selections.</p>}</Card>
          <Card className="p-5" padding="none" variant="sage"><span aria-hidden="true" className="material-symbols-outlined text-[#325347]">schedule</span><h3 className="mt-3 font-medium text-[#002117]">Time of day</h3>{timePatterns.length >= 2 && timePatterns[0].averageMood - timePatterns.at(-1)!.averageMood >= 0.5 ? <p className="mt-3 text-sm leading-6 text-[#325347]">Your <strong>{timePatterns[0].period}</strong> check-ins have tended to be higher than your {timePatterns.at(-1)!.period} check-ins.</p> : <p className="mt-3 text-sm leading-6 text-[#325347]">No clear time-of-day pattern has enough support yet.</p>}</Card>
          <Card className="p-5" padding="none" variant="inset"><span aria-hidden="true" className="material-symbols-outlined text-[#795841]">bedtime</span><h3 className="mt-3 font-medium text-[#2c1601]">Sleep and mood</h3>{sleepAssociation && Math.abs(sleepAssociation.difference) >= 0.5 ? <p className="mt-3 text-sm leading-6 text-[#596c60]">Your {sleepAssociation.difference > 0 ? "higher" : "lower"} sleep-quality check-ins have often occurred alongside {sleepAssociation.difference > 0 ? "higher" : "lower"} mood ratings.</p> : <p className="mt-3 text-sm leading-6 text-[#596c60]">Add sleep quality to four or more check-ins to explore this comparison.</p>}</Card>
        </div>
      </section>
    </div>
  );
}
