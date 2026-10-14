"use client";

import { useId } from "react";
import type { MoodEntry } from "@/src/types/database";
import { calculateMetricAverage, entriesWithinDays, moodEntryDate, MOOD_ANALYTICS_MINIMUMS, type MoodMetricKey } from "@/src/lib/mood/analytics";

const metricLabels: Record<MoodMetricKey, string> = {
  moodScore: "Mood", stressScore: "Stress", energyScore: "Energy", sleepQualityScore: "Sleep",
  anxietyScore: "Tension", focusScore: "Focus", socialConnectionScore: "Connection",
  physicalWellbeingScore: "Physical wellbeing",
};
type ChartPoint = { id: string; date: Date; score: number; count: number };

function chartPoints(entries: MoodEntry[], metric: MoodMetricKey, rangeDays: 7 | 30 | 90): ChartPoint[] {
  const valid = entriesWithinDays(entries, rangeDays)
    .map((entry) => ({ entry, date: moodEntryDate(entry), score: entry[metric] }))
    .filter((item): item is { entry: MoodEntry; date: Date; score: number } => Boolean(item.date) && typeof item.score === "number" && item.score >= 1 && item.score <= 10)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  if (rangeDays === 7) return valid.map(({ entry, date, score }, index) => ({ id: entry.id ?? `${metric}-${index}`, date, score, count: 1 }));
  const groups = new Map<string, { date: Date; entries: MoodEntry[] }>();
  for (const item of valid) {
    const key = item.entry.localDate && /^\d{4}-\d{2}-\d{2}$/.test(item.entry.localDate) ? item.entry.localDate : item.date.toLocaleDateString("en-CA");
    const group = groups.get(key) ?? { date: item.date, entries: [] };
    group.entries.push(item.entry);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, group]) => ({
    id: `${metric}-${key}`, date: group.date, score: calculateMetricAverage(group.entries, metric)!, count: group.entries.length,
  })).sort((a, b) => a.date.getTime() - b.date.getTime());
}

function splitAtGaps<T extends { date: Date }>(points: T[], rangeDays: 7 | 30 | 90) {
  const maximumGap = (rangeDays === 7 ? 1.75 : rangeDays === 30 ? 3.5 : 8) * 86_400_000;
  const segments: T[][] = [];
  for (const point of points) {
    const current = segments.at(-1);
    if (!current || point.date.getTime() - current.at(-1)!.date.getTime() > maximumGap) segments.push([point]);
    else current.push(point);
  }
  return segments;
}

export function MoodTrend({ entries, rangeDays = 7, comparisonMetric }: {
  entries: MoodEntry[]; rangeDays?: 7 | 30 | 90; comparisonMetric?: Exclude<MoodMetricKey, "moodScore">;
}) {
  const chartId = useId();
  const now = new Date();
  const mood = chartPoints(entries, "moodScore", rangeDays);
  const comparison = comparisonMetric ? chartPoints(entries, comparisonMetric, rangeDays) : [];
  const pairedCount = comparisonMetric ? entriesWithinDays(entries, rangeDays).filter((entry) => typeof entry.moodScore === "number" && typeof entry[comparisonMetric] === "number").length : 0;
  const showComparison = Boolean(comparisonMetric && pairedCount >= MOOD_ANALYTICS_MINIMUMS.trendComparison);
  if (!mood.length) return <div className="mt-6 flex min-h-52 flex-col items-center justify-center rounded-[1.75rem] bg-[#fff1e8] p-6 text-center"><span aria-hidden="true" className="clay-icon material-symbols-outlined">show_chart</span><p className="mt-4 max-w-xs text-sm leading-6 text-[#414845]">A few check-ins will help patterns start to appear.</p></div>;
  const start = now.getTime() - rangeDays * 86_400_000;
  const x = (date: Date) => 42 + Math.max(0, Math.min(1, (date.getTime() - start) / (rangeDays * 86_400_000))) * 536;
  const y = (score: number) => 190 - (score - 1) / 9 * 164;
  const shortDate = (date: Date) => date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const fullDate = (date: Date) => date.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <figure className="mt-5">
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-[#596c60]"><span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-[#446558]" />Mood</span>{showComparison && comparisonMetric ? <span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-[#c66b4e]" />{metricLabels[comparisonMetric]}</span> : null}</div>
      <svg aria-labelledby={`${chartId}-title ${chartId}-description`} className="w-full" role="img" viewBox="0 0 600 224">
        <title id={`${chartId}-title`}>Mood trend over {rangeDays} days{showComparison && comparisonMetric ? ` compared with ${metricLabels[comparisonMetric].toLowerCase()}` : ""}</title>
        <desc id={`${chartId}-description`}>Scores from 1 to 10 plotted at their actual dates. Lines stop where there are gaps in check-ins. Exact observed values are available below.</desc>
        {[1, 5, 10].map((score) => <g key={score}><line stroke="#c1c8c3" strokeDasharray="3 7" strokeOpacity=".5" x1="42" x2="578" y1={y(score)} y2={y(score)} /><text fill="#596c60" fontSize="12" x="10" y={y(score) + 4}>{score}</text></g>)}
        {splitAtGaps(mood, rangeDays).map((segment, index) => segment.length > 1 ? <polyline fill="none" key={`mood-${index}`} points={segment.map((point) => `${x(point.date)},${y(point.score)}`).join(" ")} stroke="#446558" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" /> : null)}
        {showComparison ? splitAtGaps(comparison, rangeDays).map((segment, index) => segment.length > 1 ? <polyline fill="none" key={`comparison-${index}`} points={segment.map((point) => `${x(point.date)},${y(point.score)}`).join(" ")} stroke="#c66b4e" strokeDasharray="6 5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" /> : null) : null}
        {mood.map((point) => <circle cx={x(point.date)} cy={y(point.score)} fill="#fff8f5" key={point.id} r="5" stroke="#446558" strokeWidth="2"><title>{fullDate(point.date)}: mood {point.score}/10{point.count > 1 ? ` daily average from ${point.count} check-ins` : ""}</title></circle>)}
        {showComparison && comparisonMetric ? comparison.map((point) => <circle cx={x(point.date)} cy={y(point.score)} fill="#fff8f5" key={point.id} r="4" stroke="#c66b4e" strokeWidth="2"><title>{fullDate(point.date)}: {metricLabels[comparisonMetric]} {point.score}/10</title></circle>) : null}
        <text fill="#596c60" fontSize="12" x="42" y="219">{shortDate(new Date(start))}</text><text fill="#596c60" fontSize="12" textAnchor="end" x="578" y="219">Today</text>
      </svg>
      <figcaption className="mt-3 text-xs leading-5 text-[#596c60]">Dots are observed check-ins{rangeDays > 7 ? " (daily averages when there is more than one)" : ""}. Blank space stays blank, and lines stop across longer gaps.{comparisonMetric && !showComparison ? " Four paired check-ins are needed before a comparison appears." : ""}</figcaption>
      <details className="mt-3 text-xs text-[#596c60]"><summary className="min-h-11 w-fit cursor-pointer rounded-full py-3 font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#325347]">View observed mood values</summary><div className="mt-2 max-h-64 overflow-auto rounded-2xl bg-[#fff1e8] p-3"><table className="w-full text-left"><caption className="sr-only">Mood check-ins in the selected range</caption><thead><tr><th className="p-2 font-medium" scope="col">When</th><th className="p-2 font-medium" scope="col">Mood</th></tr></thead><tbody>{mood.map((point) => <tr key={`row-${point.id}`}><td className="p-2">{fullDate(point.date)}</td><td className="p-2">{point.score}/10</td></tr>)}</tbody></table></div></details>
    </figure>
  );
}
