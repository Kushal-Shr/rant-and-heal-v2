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
    <fieldset className="relative rounded-[1.35rem] bg-[#fff1e8] p-4">
      <legend className="pr-14 text-sm font-medium text-[#414845]">{label} <span className="font-normal text-[#596c60]">(optional)</span></legend>
      {value !== undefined ? <button className="absolute right-2 top-1 min-h-11 rounded-full px-3 text-xs font-medium text-[#596c60] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#325347]" onClick={() => onChange(undefined)} type="button">Clear</button> : null}
      <div aria-label={`${label}, from ${low} to ${high}`} className="mt-2 grid grid-cols-5 gap-2">
        {scoreChoices.map((score, index) => (
          <button
            aria-label={`${label}: ${index + 1} of 5, ${index === 0 ? low : index === 4 ? high : "in between"}`}
            aria-pressed={value === score}
            className={`min-h-11 rounded-full border text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#325347] ${value === score ? "border-[#325347] bg-[#c6ebda] text-[#002117]" : "border-white bg-white/75 text-[#596c60] hover:bg-white"}`}
            key={score}
            onClick={() => onChange(score)}
            type="button"
          >
            {index + 1}
          </button>
        ))}
      </div>
      <div aria-hidden="true" className="mt-1 flex justify-between text-[10px] text-[#596c60]"><span>{low}</span><span>{high}</span></div>
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
      <div className="text-center">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#4a6b5e]/70">Daily check-in</p>
        <h2 className="mt-2 text-2xl font-medium tracking-[-0.02em] text-[#325347] sm:text-3xl">How are you feeling right now?</h2>
        <p className="mt-2 text-sm text-[#596c60]">Mood is the only required answer. Add as much or as little context as feels useful.</p>
      </div>

      <fieldset className="mt-7">
        <legend className="sr-only">Choose your current mood</legend>
        <div className="mx-auto flex max-w-xl items-end justify-center gap-2 sm:gap-5">
          {moodChoices.map((choice) => {
            const isSelected = moodScore === choice.score;
            return (
              <button
                aria-label={`${choice.label}, ${choice.score} out of 10`}
                aria-pressed={isSelected}
                className={`group flex size-12 items-center justify-center rounded-full border border-white/80 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#325347] focus-visible:ring-offset-4 sm:size-16 ${choice.className} ${isSelected ? "-translate-y-2 scale-110 shadow-[0_12px_20px_-6px_rgba(44,22,1,0.25)]" : "shadow-[0_8px_15px_-6px_rgba(44,22,1,0.18)] hover:-translate-y-1"}`}
                key={choice.score}
                onClick={() => setMoodScore(choice.score)}
                type="button"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-2xl sm:text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>{choice.icon}</span>
              </button>
            );
          })}
        </div>
        <p aria-live="polite" className="mt-5 text-center text-sm text-[#414845]/70">{moodChoices.find((choice) => choice.score === moodScore)?.label ?? "Choose what feels closest"}</p>
      </fieldset>

      <div className="mt-7 grid gap-3 border-t border-[#ffeada] pt-6 sm:grid-cols-2">
        <ScorePicker high="High energy" label="Energy" low="Low energy" onChange={(value) => setScores((current) => ({ ...current, energyScore: value }))} value={scores.energyScore} />
        <ScorePicker high="Very stressed" label="Stress" low="At ease" onChange={(value) => setScores((current) => ({ ...current, stressScore: value }))} value={scores.stressScore} />
      </div>

      <details className="mt-4 rounded-[1.5rem] border border-[#ffeada] bg-white/45 p-4 open:bg-white/70 sm:p-5">
        <summary className="min-h-11 cursor-pointer rounded-full py-2 font-medium text-[#325347] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#325347]">Add more context <span className="font-normal text-[#596c60]">(optional)</span></summary>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
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

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        {feedback ? <p className={`rounded-2xl px-4 py-2 text-sm ${feedback.type === "success" ? "bg-[#c6ebda] text-[#002117]" : "bg-[#ffdad6] text-[#93000a]"}`} role="status">{feedback.message}</p> : <span />}
        <Button isLoading={isSaving} type="submit">Save check-in</Button>
      </div>
    </form>
  );
}
