"use client";

import { FormEvent, useState } from "react";
import { Textarea } from "@/src/components/forms/Textarea";
import { Button } from "@/src/components/ui/Button";
import { createMoodEntry } from "@/src/services/moodService";
import {
  HELPFUL_FACTOR_LABELS,
  HELPFUL_FACTORS,
  MOOD_CONTEXT_LABELS,
  MOOD_CONTEXTS,
  type HelpfulFactor,
  type MoodContext,
} from "@/src/lib/mood/schema";

const scoreChoices = [2, 4, 6, 8, 10] as const;
const moodChoices = [
  { score: 2, icon: "sentiment_very_dissatisfied", label: "Having a hard time", className: "bg-[#ffdad6] text-[#93000a]" },
  { score: 4, icon: "sentiment_dissatisfied", label: "Low", className: "bg-[#ffdcbf] text-[#793b26]" },
  { score: 6, icon: "sentiment_neutral", label: "Steady", className: "bg-white text-[#785741]" },
  { score: 8, icon: "sentiment_satisfied", label: "Good", className: "bg-[#abcebf] text-[#325347]" },
  { score: 10, icon: "sentiment_very_satisfied", label: "Great", className: "bg-[#c6ebda] text-[#325347]" },
] as const;

type OptionalScoreKey =
  | "energyScore"
  | "stressScore"
  | "anxietyScore"
  | "sleepQualityScore"
  | "focusScore"
  | "socialConnectionScore"
  | "physicalWellbeingScore";

const extraDimensions: { key: OptionalScoreKey; label: string; low: string; high: string }[] = [
  { key: "anxietyScore", label: "Tension", low: "Very low", high: "Very high" },
  { key: "sleepQualityScore", label: "Sleep quality", low: "Poor", high: "Great" },
  { key: "focusScore", label: "Focus", low: "Scattered", high: "Focused" },
  { key: "socialConnectionScore", label: "Connection", low: "Disconnected", high: "Connected" },
  { key: "physicalWellbeingScore", label: "Physical wellbeing", low: "Rough", high: "Strong" },
];

function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function ScorePicker({ label, low, high, value, onChange }: {
  label: string;
  low: string;
  high: string;
  value?: number;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <fieldset className="min-w-0 rounded-2xl border border-[#e9e6de] bg-[#faf9f5] px-4 pb-4 pt-2">
      <legend className="px-1 text-sm font-medium text-[#414845]">{label} <span className="ml-1 text-xs font-normal text-[#596c60]">optional</span></legend>
      <div className="flex min-h-8 items-center justify-between text-xs text-[#596c60]">
        <span>{value === undefined ? "Choose if you’d like" : `${value}/10 selected`}</span>
        <button aria-label={`Clear ${label.toLowerCase()}`} className={`min-h-11 rounded-full px-2 underline underline-offset-4 ${value === undefined ? "invisible" : ""}`} onClick={() => onChange(undefined)} tabIndex={value === undefined ? -1 : 0} type="button">Clear</button>
      </div>
      <div aria-label={`${label}, from ${low} to ${high}`} className="grid grid-cols-5 gap-2">
        {scoreChoices.map((score, index) => (
          <button
            aria-label={`${label}: ${score} out of 10, ${index === 0 ? low : index === 4 ? high : "in between"}`}
            aria-pressed={value === score}
            className={`min-h-11 rounded-xl border text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#325347] ${value === score ? "border-[#325347] bg-[#325347] text-white shadow-sm" : "border-[#e5e8df] bg-white text-[#596c60] hover:border-[#92af9f] hover:bg-[#f0f5ef]"}`}
            key={score}
            onClick={() => onChange(score)}
            type="button"
          >
            {score}
          </button>
        ))}
      </div>
      <div aria-hidden="true" className="mt-2 flex justify-between gap-2 text-xs text-[#596c60]"><span>{low}</span><span>{high}</span></div>
    </fieldset>
  );
}

function toggleValue<T extends string>(values: T[], value: T, max: number) {
  if (values.includes(value)) return values.filter((item) => item !== value);
  return values.length >= max ? values : [...values, value];
}

export function MoodCheckInForm({ uid, onSaved }: { uid: string; onSaved: () => Promise<void> }) {
  const [moodScore, setMoodScore] = useState<number>();
  const [scores, setScores] = useState<Partial<Record<OptionalScoreKey, number>>>({});
  const [contexts, setContexts] = useState<MoodContext[]>([]);
  const [helpfulFactors, setHelpfulFactors] = useState<HelpfulFactor[]>([]);
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!moodScore) {
      setFeedback({ type: "error", message: "Choose the mood that feels closest right now." });
      return;
    }
    setIsSaving(true);
    setFeedback(null);
    try {
      const now = new Date();
      await createMoodEntry(uid, {
        moodScore,
        ...scores,
        contexts,
        helpfulFactors,
        note,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        localDate: localDateString(now),
      });
      setMoodScore(undefined);
      setScores({});
      setContexts([]);
      setHelpfulFactors([]);
      setNote("");
      setFeedback({ type: "success", message: "Your check-in is safely saved." });
      await onSaved();
    } catch (error) {
      console.error("Failed to save mood entry:", error);
      setFeedback({ type: "error", message: "Could not save that check-in. Try again." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#596c60]">A moment for you</p>
        <h2 className="mt-2 text-2xl font-medium tracking-[-0.035em] text-[#325347] sm:text-3xl">How are you feeling?</h2>
        <p className="mt-2 text-sm leading-6 text-[#596c60]">No right answer. Just where you are right now.</p></div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f1f4ed] px-3 py-2 text-xs text-[#526753]"><span aria-hidden="true" className="material-symbols-outlined !text-base">schedule</span>20-second check-in</span>
      </div>

      <fieldset className="mt-7">
        <legend className="sr-only">Choose your current mood</legend>
        <div className="grid grid-cols-5 gap-1.5 sm:gap-3">
          {moodChoices.map((choice) => {
            const isSelected = moodScore === choice.score;
            return (
              <button
                aria-label={`${choice.label}, ${choice.score} out of 10`}
                aria-pressed={isSelected}
                className={`group flex min-w-0 flex-col items-center gap-3 rounded-2xl border px-1 py-4 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#325347] focus-visible:ring-offset-4 sm:rounded-3xl sm:py-5 ${isSelected ? "border-[#799c88] bg-[#edf4eb] shadow-[0_6px_16px_-10px_#32534780]" : "border-transparent bg-[#faf8f4] hover:border-[#dbded4] hover:bg-[#f4f4ed]"}`}
                key={choice.score}
                onClick={() => setMoodScore(choice.score)}
                type="button"
              >
                <span className={`flex size-10 items-center justify-center rounded-full shadow-[inset_0_2px_3px_#ffffffaa,0_5px_9px_-5px_#78574155] transition-transform group-hover:-translate-y-1 sm:size-14 ${choice.className}`}><span aria-hidden="true" className="material-symbols-outlined !text-[28px] sm:!text-[34px]" style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}>{choice.icon}</span></span>
                <span className={`text-center text-[11px] font-medium sm:text-sm ${isSelected ? "text-[#325347]" : "text-[#657267]"}`}>{choice.score === 2 ? "Very low" : choice.label}</span>
              </button>
            );
          })}
        </div>
        <p aria-live="polite" className="mt-3 text-center text-xs text-[#596c60]">{moodScore ? `${moodChoices.find((choice) => choice.score === moodScore)?.label} · ${moodScore}/10` : "Choose the mood that feels closest to you"}</p>
      </fieldset>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-1 min-[1100px]:grid-cols-2">
        <ScorePicker high="High energy" label="Energy" low="Low energy" onChange={(value) => setScores((current) => ({ ...current, energyScore: value }))} value={scores.energyScore} />
        <ScorePicker high="Very stressed" label="Stress" low="At ease" onChange={(value) => setScores((current) => ({ ...current, stressScore: value }))} value={scores.stressScore} />
      </div>

      <details className="group/context mt-5 rounded-2xl border border-[#e9e6de] bg-white/45 px-4 open:pb-5 sm:px-5">
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 rounded-xl py-3 text-sm font-medium text-[#325347] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#325347] [&::-webkit-details-marker]:hidden"><span className="flex items-center gap-3"><span aria-hidden="true" className="material-symbols-outlined !text-xl text-[#7a8c76]">tune</span>Add more context <span className="text-xs font-normal text-[#596c60]">optional</span></span><span aria-hidden="true" className="material-symbols-outlined !text-xl transition-transform group-open/context:rotate-180">expand_more</span></summary>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 md:grid-cols-1 min-[1100px]:grid-cols-2">
          {extraDimensions.map((dimension) => <ScorePicker {...dimension} key={dimension.key} onChange={(value) => setScores((current) => ({ ...current, [dimension.key]: value }))} value={scores[dimension.key]} />)}
        </div>

        <fieldset className="mt-6">
          <legend className="font-medium text-[#414845]">What influenced how you&apos;re feeling? <span className="font-normal text-[#596c60]">(optional)</span></legend>
          <p className="mt-1 text-xs text-[#596c60]">Choose any that fit.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {MOOD_CONTEXTS.map((context) => <button aria-pressed={contexts.includes(context)} className={`min-h-11 rounded-full border px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#325347] ${contexts.includes(context) ? "border-[#325347] bg-[#c6ebda] text-[#002117]" : "border-[#e7d8ce] bg-white text-[#414845]"}`} key={context} onClick={() => setContexts((current) => toggleValue(current, context, 12))} type="button">{MOOD_CONTEXT_LABELS[context]}</button>)}
          </div>
        </fieldset>

        <fieldset className="mt-6">
          <legend className="font-medium text-[#414845]">Anything helping today? <span className="font-normal text-[#596c60]">(optional)</span></legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {HELPFUL_FACTORS.map((factor) => <button aria-pressed={helpfulFactors.includes(factor)} className={`min-h-11 rounded-full border px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#325347] ${helpfulFactors.includes(factor) ? "border-[#795841] bg-[#ffe3cd] text-[#2c1601]" : "border-[#e7d8ce] bg-white text-[#414845]"}`} key={factor} onClick={() => setHelpfulFactors((current) => toggleValue(current, factor, 10))} type="button">{HELPFUL_FACTOR_LABELS[factor]}</button>)}
          </div>
        </fieldset>

        <label className="mt-6 block">
          <span className="font-medium text-[#414845]">Anything you want to remember about today? <span className="font-normal text-[#596c60]">(optional)</span></span>
          <Textarea className="mt-2 min-h-24 rounded-[1rem] bg-white px-4 py-3 text-sm shadow-none" maxLength={1000} onChange={(event) => setNote(event.target.value)} placeholder="This stays with this check-in. It is separate from your encrypted journal." rows={3} value={note} />
          <span className="mt-1 block text-right text-xs text-[#596c60]">{note.length}/1,000</span>
        </label>
      </details>

      <div className="mt-6 flex flex-col-reverse items-stretch justify-between gap-4 border-t border-[#ecebe3] pt-5 sm:flex-row sm:items-center">
        {feedback ? <p className={`rounded-2xl px-4 py-2 text-sm ${feedback.type === "success" ? "bg-[#c6ebda] text-[#002117]" : "bg-[#ffdad6] text-[#93000a]"}`} role="status">{feedback.message}</p> : <p className="text-center text-xs text-[#657267] sm:text-left">Just your mood is enough. Everything else is optional.</p>}
        <Button className="min-h-12 shrink-0 sm:min-w-44" isLoading={isSaving} type="submit">Save check-in<span aria-hidden="true" className="material-symbols-outlined !text-lg">arrow_forward</span></Button>
      </div>
    </form>
  );
}
