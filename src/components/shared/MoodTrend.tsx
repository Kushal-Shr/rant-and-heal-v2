"use client";

import { useId } from "react";
import { Timestamp } from "firebase/firestore";
import type { MoodEntry } from "@/src/types/database";

export function MoodTrend({ entries }: { entries: MoodEntry[] }) {
  const gradientId = useId();
  const points = entries
    .filter((entry) => entry.createdAt instanceof Timestamp && Number.isFinite(entry.moodScore) && entry.moodScore >= 1 && entry.moodScore <= 10)
    .slice().sort((a, b) => (a.createdAt as Timestamp).toMillis() - (b.createdAt as Timestamp).toMillis())
    .map((entry, index, all) => ({
      id: entry.id ?? `${index}`,
      x: all.length === 1 ? 310 : 42 + index / (all.length - 1) * 536,
      y: 190 - (entry.moodScore - 1) / 9 * 164,
      score: entry.moodScore,
      date: (entry.createdAt as Timestamp).toDate(),
    }));
  if (!points.length) return <div className="mt-6 flex min-h-52 flex-col items-center justify-center rounded-[1.75rem] bg-[#fff1e8] p-6 text-center"><span aria-hidden="true" className="clay-icon material-symbols-outlined">show_chart</span><p className="mt-4 max-w-xs text-sm leading-6 text-[#414845]">Your first check-in starts your story. Save one to see your mood here.</p></div>;
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const shortDate = (date: Date) => date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const fullDate = (date: Date) => date.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <figure className="mt-5">
      <svg role="img" aria-labelledby={`${gradientId}-title ${gradientId}-description`} viewBox="0 0 600 224" className="w-full">
        <title id={`${gradientId}-title`}>Mood across your {points.length} most recent check-ins</title>
        <desc id={`${gradientId}-description`}>Mood scores from 1 to 10, oldest to newest. Each point is one check-in, spaced equally. Exact values are available below.</desc>
        <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#abcebf" stopOpacity=".6"/><stop offset="100%" stopColor="#abcebf" stopOpacity="0"/></linearGradient></defs>
        {[1, 5, 10].map((score) => {
          const y = 190 - (score - 1) / 9 * 164;
          return <g key={score}><line x1="42" x2="578" y1={y} y2={y} stroke="#c1c8c3" strokeOpacity=".5" strokeDasharray="3 7"/><text x="10" y={y + 4} fontSize="12" fill="#596c60">{score}</text></g>;
        })}
        {points.length > 1 && <><polygon points={`${points[0].x},190 ${line} ${points.at(-1)!.x},190`} fill={`url(#${gradientId})`}/><polyline points={line} fill="none" stroke="#446558" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></>}
        {points.map((point) => <circle key={point.id} cx={point.x} cy={point.y} r="5" fill="#fff8f5" stroke="#446558" strokeWidth="2"><title>{fullDate(point.date)}: {point.score}/10</title></circle>)}
        <text x="42" y="219" fontSize="12" fill="#596c60">{shortDate(points[0].date)}</text>
        {points.length > 1 && <text x="578" y="219" textAnchor="end" fontSize="12" fill="#596c60">{shortDate(points.at(-1)!.date)}</text>}
      </svg>
      <figcaption className="mt-3 text-xs leading-5 text-[#596c60]">Each dot is a check-in, from oldest to newest. Mood is recorded on a 1–10 scale.</figcaption>
      <details className="mt-3 text-xs text-[#596c60]">
        <summary className="w-fit rounded-full py-2 font-medium underline underline-offset-4">View check-in values</summary>
        <div className="mt-2 overflow-x-auto rounded-2xl bg-[#fff1e8] p-3"><table className="w-full text-left"><caption className="sr-only">Recent mood check-ins</caption><thead><tr><th scope="col" className="p-2 font-medium">When</th><th scope="col" className="p-2 font-medium">Mood</th></tr></thead><tbody>{points.map((point) => <tr key={point.id}><td className="p-2">{fullDate(point.date)}</td><td className="p-2">{point.score}/10</td></tr>)}</tbody></table></div>
      </details>
    </figure>
  );
}
