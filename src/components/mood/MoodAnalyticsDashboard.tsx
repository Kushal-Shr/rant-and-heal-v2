"use client";

import { useMemo, useState, type ReactNode } from "react";
import { MOOD_EMOTION_VISUALS } from "@/src/components/mood/emotionStyles";
import { Card } from "@/src/components/ui/Card";
import { MoodTrend } from "@/src/components/shared/MoodTrend";
import type { MoodEntry } from "@/src/types/database";
import {
  calculateContextPatterns, calculateHelpfulFactorPatterns, calculateMetricAssociation,
  calculateContextFrequency, calculateDailyMoodHistory, calculateEmotionAverageIntensity,
  calculateEmotionFrequency, calculatePersonalMoodInsights, calculateTimeOfDayPatterns,
  calculateWeeklySnapshot, entriesWithinDays,
  moodEntryDate, weeklyComparisonText, type MoodMetricKey,
} from "@/src/lib/mood/analytics";
import { friendlyTag, MOOD_EMOTION_LABELS } from "@/src/lib/mood/schema";

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

function CompactStat({ label, value, suffix, icon, tone = "border-[#dce8d7] bg-[#f1f6ee]", iconTone = "bg-white/70 text-[#55745f]" }: { label: string; value: string | number; suffix?: string; icon: string; tone?: string; iconTone?: string }) {
  return (
    <div className={`min-w-0 rounded-2xl border p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-sm motion-reduce:hover:translate-y-0 ${tone}`}>
      <div className="mb-4 flex items-center gap-2 text-[#657267]"><span className={`flex size-8 shrink-0 items-center justify-center rounded-xl ${iconTone}`}><Icon className="!text-lg" name={icon} /></span><p className="text-xs">{label}</p></div>
      <p className={`${typeof value === "number" ? "text-3xl" : "text-lg"} font-medium tracking-tight text-[#325347]`}>{value}{suffix ? <span className="ml-1 text-sm font-normal text-[#657267]">{suffix}</span> : null}</p>
    </div>
  );
}

function PatternCard({ title, icon, tone, surface = "border-[#e7e8df] bg-white/65", children }: { title: string; icon: string; tone: string; surface?: string; children: ReactNode }) {
  return (
    <article className={`flex gap-4 rounded-3xl border p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-sm motion-reduce:hover:translate-y-0 sm:p-6 ${surface}`}>
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
  const weeklyEntries = useMemo(() => entriesWithinDays(entries, 7), [entries]);
  const emotionFrequency = useMemo(() => calculateEmotionFrequency(weeklyEntries), [weeklyEntries]);
  const emotionAverages = useMemo(() => calculateEmotionAverageIntensity(weeklyEntries), [weeklyEntries]);
  const contextFrequency = useMemo(() => calculateContextFrequency(weeklyEntries, 3), [weeklyEntries]);
  const history = useMemo(() => calculateDailyMoodHistory(entries, 14), [entries]);
  const personalInsights = useMemo(() => calculatePersonalMoodInsights(entries), [entries]);
  const comparisonText = weeklyComparisonText(weekly.comparison);
  const latestDate = latest ? moodEntryDate(latest) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 px-1 pt-3"><h2 className="shrink-0 text-lg font-medium tracking-tight text-[#325347]">Your recent rhythm</h2><div aria-hidden="true" className="h-px flex-1 bg-[#dfe4da]" /><span className="text-xs text-[#657267]">One check-in at a time</span></div>

      <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
        <Card className={`${panel} !bg-gradient-to-br !from-white !via-[#fffaf5] !to-[#f0f5ec]`} padding="none">
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

        <Card className="min-w-0 !rounded-[2rem] !bg-gradient-to-br !from-[#e5eddf] !via-[#edf2e6] !to-[#ffe9d8] p-5 sm:p-7" padding="none" variant="sage">
          <div className="flex items-center justify-between gap-3"><p className={eyebrow}>Your latest moment</p><Icon className="!text-xl text-[#68816b]" name="eco" /></div>
          <h3 className="mt-2 text-xl font-medium tracking-tight text-[#325347]">Latest check-in</h3>
          {isLoading ? <p className="py-8 text-sm text-[#596c60]">Loading your latest check-in…</p> : latest ? <>
            <div className="mt-5 flex items-center gap-4">
              <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-white/60 shadow-[inset_0_2px_4px_white]"><Icon className="!text-4xl text-[#5a795c]" name={typeof latest.moodScore === "number" ? latest.moodScore >= 7 ? "sentiment_satisfied" : latest.moodScore >= 5 ? "sentiment_neutral" : "sentiment_dissatisfied" : "favorite"} /></span>
              <div>{typeof latest.moodScore === "number" ? <p className="text-4xl font-medium tracking-tight text-[#325347]">{latest.moodScore}<span className="ml-1 text-base font-normal text-[#657267]">/10</span></p> : <p className="text-lg font-medium text-[#325347]">{latest.emotions?.slice(0, 2).map((item) => MOOD_EMOTION_LABELS[item.emotion]).join(" + ") || "Check-in"}</p>}<p className="mt-1 text-xs text-[#526753]">{latestDate?.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p></div>
            </div>
            {latest.emotions?.length ? <div className="mt-4 flex flex-wrap gap-1.5">{latest.emotions.map((item) => { const visual = MOOD_EMOTION_VISUALS[item.emotion]; return <span className={`rounded-full border px-2.5 py-1.5 text-[11px] ${visual.selected}`} key={item.emotion}>{MOOD_EMOTION_LABELS[item.emotion]}{item.intensity ? ` · ${item.intensity}/10` : ""}</span>; })}</div> : null}
            {latestOptional.length ? <dl className="mt-5 divide-y divide-[#cddac6]">{latestOptional.map(({ key, label }) => <div className="flex items-center justify-between gap-3 py-2.5 text-xs" key={key}><dt className="text-[#526753]">{label}</dt><dd className="flex items-center gap-3 font-medium text-[#325347]"><span aria-hidden="true" className="h-1.5 w-12 overflow-hidden rounded-full bg-white/70"><span className="block h-full rounded-full bg-[#87a17b]" style={{ width: `${latest[key]! * 10}%` }} /></span>{latest[key]}<span className="-ml-2 text-[#657267]">/10</span></dd></div>)}</dl> : null}
            {latest.contexts?.length ? <div className="mt-4 flex flex-wrap gap-1.5">{latest.contexts.slice(0, 5).map((tag) => <span className="rounded-full border border-white/50 bg-white/45 px-2.5 py-1.5 text-[11px] text-[#526753]" key={tag}>{friendlyTag(tag)}</span>)}</div> : null}
          </> : <p className="my-7 text-sm leading-6 text-[#526753]">A small pause, a little self-kindness. Your first check-in will find a home here.</p>}
          <a className="mt-5 flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#b7c9af] bg-white/40 px-4 py-3 text-sm font-medium text-[#325347] transition hover:bg-white/80" href="#check-in">{latest ? "Check in again" : "Take a moment"}<Icon className="!text-base" name="arrow_forward" /></a>
        </Card>
      </section>

      <Card className={`${panel} !bg-gradient-to-br !from-white !to-[#fff8f1]`} padding="none">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className={eyebrow}>The last 7 days</p><h3 className="mt-2 text-2xl font-medium tracking-tight text-[#325347]">Your week at a glance</h3></div><span className="inline-flex items-center gap-2 rounded-full bg-[#f0f3eb] px-3 py-2 text-xs text-[#526753]"><Icon className="!text-base" name="calendar_today" />{weekly.checkIns} check-in{weekly.checkIns === 1 ? "" : "s"} · {weekly.daysCheckedIn} day{weekly.daysCheckedIn === 1 ? "" : "s"}</span></div>
        {isLoading ? <p className="py-8 text-sm text-[#657267]">Loading your week…</p> : weekly.checkIns ? <>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-2 xl:grid-cols-3">
            <CompactStat icon="sentiment_satisfied" iconTone="bg-[#c6ebda] text-[#325347]" label="Average mood" suffix="/10" tone="border-[#cfe2d7] bg-[#f1f8f3]" value={weekly.averageMood ?? "—"} />
            {weekly.averageStress !== null ? <CompactStat icon="waves" iconTone="bg-[#ffdad6] text-[#83000a]" label="Average stress" suffix="/10" tone="border-[#efd5d1] bg-[#fff7f6]" value={weekly.averageStress} /> : null}
            {weekly.averageEnergy !== null ? <CompactStat icon="bolt" iconTone="bg-[#ffdcbf] text-[#70451f]" label="Average energy" suffix="/10" tone="border-[#eedbc7] bg-[#fff9f2]" value={weekly.averageEnergy} /> : null}
            {weekly.variability ? <CompactStat icon="equalizer" iconTone="bg-[#ded3e5] text-[#5d4d68]" label="Mood felt" tone="border-[#ddd4e3] bg-[#faf7fb]" value={weekly.variability.label} /> : null}
            {weekly.highest ? <CompactStat icon="north_east" iconTone="bg-[#e4ecd9] text-[#52663d]" label="Highest check-in" tone="border-[#dbe4ce] bg-[#fafcf6]" value={weekly.highest.date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} /> : null}
            {weekly.lowest ? <CompactStat icon="south_east" iconTone="bg-[#eee8db] text-[#6c5d43]" label="Lowest check-in" tone="border-[#e4ddd0] bg-[#fcfaf6]" value={weekly.lowest.date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} /> : null}
          </div>
          <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-[#657267]"><Icon className="!text-base" name="auto_awesome" />{comparisonText ?? "As you check in over time, a week-to-week reflection will appear here."}</p>
        </> : <p className="mt-5 rounded-2xl bg-[#f6f7f1] p-5 text-sm leading-6 text-[#657267]">A few check-ins will help patterns start to appear. There&apos;s no schedule to keep.</p>}
      </Card>

      <details className="group rounded-[2rem] border border-white/80 bg-gradient-to-br from-white/75 via-[#fffaf6]/75 to-[#f0f5ec]/75 p-5 shadow-[0_10px_30px_-20px_rgba(74,107,94,0.18)] open:from-white open:to-[#f5f8f2] sm:p-7">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#325347] [&::-webkit-details-marker]:hidden"><div><p className={eyebrow}>Structured check-ins · Last 7 days</p><h2 className="mt-2 text-2xl font-medium tracking-tight text-[#325347]">Emotion details and history</h2></div><Icon className="transition-transform group-open:rotate-180" name="expand_more" /></summary>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <PatternCard icon="favorite" surface="border-[#ead8ca] bg-[#fff8f3]" title="Most reported emotions" tone="bg-[#f5e3d6] text-[#946a4d]">{emotionFrequency.length ? <ul className="space-y-2">{emotionFrequency.slice(0, 5).map((item) => <li className="flex justify-between gap-3" key={item.emotion}><span>{MOOD_EMOTION_LABELS[item.emotion]}</span><span className="font-medium text-[#325347]">{item.count} · {item.percentage}%</span></li>)}</ul> : <p>Three emotion check-ins are needed before frequencies appear.</p>}</PatternCard>
          <PatternCard icon="equalizer" surface="border-[#d9e3ce] bg-[#f8fbf4]" title="Weekly averages" tone="bg-[#e4ecd9] text-[#637c53]">{emotionAverages.length ? <ul className="space-y-2">{emotionAverages.slice(0, 5).map((item) => <li className="flex justify-between gap-3" key={item.emotion}><span>{MOOD_EMOTION_LABELS[item.emotion]}</span><span className="font-medium text-[#325347]">{item.averageIntensity}/10 <span className="font-normal text-[#657267]">({item.observations})</span></span></li>)}</ul> : <p>At least two intensity ratings for an emotion are needed before an average appears.</p>}</PatternCard>
          <PatternCard icon="label" surface="border-[#e1dacc] bg-[#fcfaf6]" title="Common contexts" tone="bg-[#eee8db] text-[#847152]">{contextFrequency.length ? <ul className="space-y-2">{contextFrequency.slice(0, 5).map((item) => <li className="flex justify-between gap-3" key={item.context}><span>{friendlyTag(item.context)}</span><span className="font-medium text-[#325347]">{item.count} · {item.percentage}%</span></li>)}</ul> : <p>A context will appear after you select it in at least three check-ins.</p>}</PatternCard>
        </div>
        {personalInsights.length ? <div className="mt-5 rounded-3xl bg-[#f6f7f1] p-5"><h3 className="font-medium text-[#325347]">Personal insights</h3><ul className="mt-2 space-y-2 text-sm leading-6 text-[#657267]">{personalInsights.map((insight) => <li key={insight}>• {insight}</li>)}</ul></div> : null}
        <div className="mt-6"><h3 className="font-medium text-[#325347]">Daily mood history</h3>{history.length ? <ol className="mt-3 divide-y divide-[#e7e8df] rounded-3xl bg-[#faf9f5] px-4">{history.map((item) => <li className="grid gap-2 py-4 sm:grid-cols-[10rem_1fr_auto] sm:items-center" key={item.id}><time className="text-xs text-[#657267]">{item.date.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time><div className="flex flex-wrap gap-1.5">{item.emotions.length ? item.emotions.map((emotion) => { const visual = MOOD_EMOTION_VISUALS[emotion.emotion]; return <span className={`rounded-full border px-2.5 py-1 text-xs ${visual.selected}`} key={emotion.emotion}>{MOOD_EMOTION_LABELS[emotion.emotion]}{emotion.intensity ? ` ${emotion.intensity}/10` : ""}</span>; }) : <span className="text-sm text-[#526753]">Legacy mood check-in</span>}{item.contexts.slice(0, 3).map((context) => <span className="rounded-full bg-[#eee8db] px-2.5 py-1 text-xs text-[#795841]" key={context}>{friendlyTag(context)}</span>)}</div>{item.moodScore !== null ? <span className="text-sm font-medium text-[#325347]">Mood {item.moodScore}/10</span> : null}</li>)}</ol> : <p className="mt-3 text-sm text-[#657267]">Your check-in history will appear here.</p>}</div>
        <p className="mt-5 text-xs leading-5 text-[#657267]">Percentages show how often you selected an emotion or context in check-ins with that kind of data. Multiple selections can appear in one check-in. Notes and Momo conversations are not shown here.</p>
      </details>

      <section aria-labelledby="patterns-heading" className="pt-3">
        <div className="mb-5 px-1"><p className={eyebrow}>Connections · Last 30 days</p><h2 className="mt-2 text-2xl font-medium tracking-tight text-[#325347]" id="patterns-heading">Little things you might notice</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#657267]">What shows up alongside your moods, as your story unfolds.</p></div>
        <div className="grid gap-4 min-[1100px]:grid-cols-2">
          <PatternCard icon="label" surface="border-[#e1dacc] bg-[#fcfaf6]" title="What’s been on your mind" tone="bg-[#eee8db] text-[#847152]">{contexts[0] ? <p><strong className="font-medium text-[#325347]">{friendlyTag(contexts[0].tag)}</strong> appeared in {contexts[0].count} check-ins{contexts[0].averageMood !== null ? `, with an average overall mood of ${contexts[0].averageMood}/10` : ""}.</p> : <p>Choose a few influences when you check in. Recurring themes will appear here.</p>}</PatternCard>
          <PatternCard icon="spa" surface="border-[#ead8ca] bg-[#fff8f3]" title="What seems to help" tone="bg-[#f5e3d6] text-[#946a4d]">{helpful[0] ? <p><strong className="font-medium text-[#325347]">{friendlyTag(helpful[0].tag)}</strong> appeared in {helpful[0].count} check-ins{helpful[0].averageMood !== null ? ` with an average overall mood of ${helpful[0].averageMood}/10` : ""}.</p> : <p>Music, a walk, a good conversation. Keep a little record of what helps.</p>}</PatternCard>
          <PatternCard icon="schedule" surface="border-[#d9e3ce] bg-[#f8fbf4]" title="Your daily rhythm" tone="bg-[#e4ecd9] text-[#637c53]">{timePatterns.length >= 2 && timePatterns[0].averageMood - timePatterns.at(-1)!.averageMood >= 0.5 ? <p>Your <strong className="font-medium text-[#325347]">{timePatterns[0].period}</strong> check-ins have tended to be higher than your {timePatterns.at(-1)!.period} check-ins.</p> : <p>A few more morning, afternoon, or evening check-ins may reveal a rhythm.</p>}</PatternCard>
          <PatternCard icon="bedtime" surface="border-[#ddd4e3] bg-[#faf7fb]" title="Rest and how you feel" tone="bg-[#ece7f0] text-[#7a698a]">{sleepAssociation && Math.abs(sleepAssociation.difference) >= 0.5 ? <p>Higher sleep-quality check-ins have often occurred alongside {sleepAssociation.difference > 0 ? "higher" : "lower"} mood ratings.</p> : <p>Include sleep quality whenever you like to explore how rest and mood line up.</p>}</PatternCard>
        </div>
        <p className="mt-4 px-1 text-xs leading-5 text-[#657267]">Based on what you choose to share. These are associations, not advice or a clinical assessment. Patterns appear only when enough check-ins support them.</p>
      </section>
    </div>
  );
}
