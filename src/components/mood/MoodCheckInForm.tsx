"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Textarea } from "@/src/components/forms/Textarea";
import { Button } from "@/src/components/ui/Button";
import { createMoodEntry } from "@/src/services/moodService";
import { MOOD_EMOTION_VISUALS } from "@/src/components/mood/emotionStyles";
import {
  HELPFUL_FACTOR_LABELS,
  HELPFUL_FACTORS,
  MOOD_CONTEXT_LABELS,
  MOOD_EMOTION_LABELS,
  MOOD_EMOTIONS,
  type HelpfulFactor,
  type MoodContext,
  type MoodEmotion,
  type MoodEmotionRating,
} from "@/src/lib/mood/schema";

const moodScores = [2, 4, 6, 8, 10] as const;
const CHECK_IN_CONTEXTS: MoodContext[] = [
  "academics", "work", "family", "friends", "relationships", "health", "sleep",
  "finances", "future-uncertainty", "social-life", "loneliness", "self-esteem", "other",
];
const moodScoreTones = {
  2: "border-[#d9a09a] bg-[#ffdad6] text-[#83000a]",
  4: "border-[#d6a987] bg-[#ffe3cd] text-[#673c27]",
  6: "border-[#d0b978] bg-[#fff0bf] text-[#594415]",
  8: "border-[#aabe82] bg-[#e4ecd9] text-[#40572f]",
  10: "border-[#8fb29f] bg-[#c6ebda] text-[#244b3d]",
} as const;

const contextTones = [
  "border-[#8fb29f] bg-[#d8eee4] text-[#244b3d]",
  "border-[#d6a987] bg-[#ffe7d5] text-[#673c27]",
  "border-[#b8a9c3] bg-[#eee9f2] text-[#55455f]",
] as const;

function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toggleValue<T extends string>(values: T[], value: T, max: number) {
  if (values.includes(value)) return values.filter((item) => item !== value);
  return values.length >= max ? values : [...values, value];
}

export function EmotionSelector({ value, onChange }: { value: MoodEmotionRating[]; onChange: (value: MoodEmotionRating[]) => void }) {
  function toggle(emotion: MoodEmotion) {
    const selected = value.some((item) => item.emotion === emotion);
    if (selected) onChange(value.filter((item) => item.emotion !== emotion));
    else if (value.length < 5) onChange([...value, { emotion }]);
  }
  return (
    <fieldset>
      <legend className="font-medium text-[#414845]">What are you feeling right now?</legend>
      <p className="mt-1 text-xs leading-5 text-[#596c60]">Choose one or more. Feelings can coexist.</p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        {MOOD_EMOTIONS.map((emotion) => {
          const selected = value.some((item) => item.emotion === emotion);
          const visual = MOOD_EMOTION_VISUALS[emotion];
          return <button aria-pressed={selected} className={`group grid h-[5.25rem] min-w-0 grid-cols-1 grid-rows-[2rem_auto] content-center items-center justify-items-start gap-2 rounded-2xl border px-3 py-2 text-left text-sm transition duration-200 min-[360px]:h-14 min-[360px]:grid-cols-[2rem_minmax(0,1fr)] min-[360px]:grid-rows-1 hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#325347] motion-reduce:hover:translate-y-0 ${selected ? visual.selected : visual.idle}`} key={emotion} onClick={() => toggle(emotion)} type="button"><span aria-hidden="true" className={`flex size-8 shrink-0 items-center justify-center rounded-xl ${visual.badge}`}><span className="material-symbols-outlined !text-lg">{visual.icon}</span></span><span className="min-w-0 font-medium leading-5">{MOOD_EMOTION_LABELS[emotion]}</span></button>;
        })}
      </div>
      <p aria-live="polite" className="mt-2 text-xs text-[#657267]">{value.length ? `${value.length} selected` : "Choose at least one emotion"}{value.length === 5 ? " · Maximum selected" : ""}</p>
    </fieldset>
  );
}

export function EmotionIntensityControl({ item, onChange }: { item: MoodEmotionRating; onChange: (value: number | undefined) => void }) {
  const visual = MOOD_EMOTION_VISUALS[item.emotion];
  return (
    <div className={`rounded-2xl border p-4 ${visual.wash}`}>
      <div className="flex min-h-11 items-center justify-between gap-3"><span className="flex items-center gap-2 font-medium text-[#414845]"><span aria-hidden="true" className={`flex size-7 items-center justify-center rounded-lg ${visual.badge}`}><span className="material-symbols-outlined !text-base">{visual.icon}</span></span>{MOOD_EMOTION_LABELS[item.emotion]}</span>{item.intensity === undefined ? <button className="min-h-11 rounded-full px-3 text-xs font-medium text-[#325347] underline underline-offset-4" onClick={() => onChange(5)} type="button">Add intensity</button> : <button className="min-h-11 rounded-full px-3 text-xs text-[#596c60] underline underline-offset-4" onClick={() => onChange(undefined)} type="button">Clear</button>}</div>
      {item.intensity !== undefined ? <><div className="mt-1 flex items-center gap-3"><input aria-label={`${MOOD_EMOTION_LABELS[item.emotion]} intensity`} className="h-11 min-w-0 flex-1 accent-[#325347]" max="10" min="1" onChange={(event) => onChange(Number(event.target.value))} type="range" value={item.intensity} /><output className="w-12 text-right text-sm font-medium text-[#325347]">{item.intensity}/10</output></div><div aria-hidden="true" className="flex justify-between text-[11px] text-[#657267]"><span>Light</span><span>Strong</span></div></> : <p className="text-xs text-[#657267]">Optional—skip this if a number does not feel useful.</p>}
    </div>
  );
}

export function MoodContextSelector({ value, onChange }: { value: MoodContext[]; onChange: (value: MoodContext[]) => void }) {
  return (
    <fieldset>
      <legend className="font-medium text-[#414845]">What&apos;s contributing to how you&apos;re feeling? <span className="font-normal text-[#596c60]">(optional)</span></legend>
      <p className="mt-1 text-xs text-[#596c60]">Only the contexts you choose are saved.</p>
      <div className="mt-3 flex flex-wrap gap-2">{CHECK_IN_CONTEXTS.map((context, index) => <button aria-pressed={value.includes(context)} className={`min-h-11 rounded-full border px-4 py-2 text-sm transition hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#325347] motion-reduce:hover:translate-y-0 ${value.includes(context) ? contextTones[index % contextTones.length] : "border-[#e7d8ce] bg-white text-[#414845] hover:bg-[#fff8f2]"}`} key={context} onClick={() => onChange(toggleValue(value, context, 12))} type="button">{MOOD_CONTEXT_LABELS[context]}</button>)}</div>
    </fieldset>
  );
}

export function MoodCheckInForm({ uid, onSaved }: { uid: string; onSaved: () => Promise<void> }) {
  const [emotions, setEmotions] = useState<MoodEmotionRating[]>([]);
  const [moodScore, setMoodScore] = useState<number>();
  const [contexts, setContexts] = useState<MoodContext[]>([]);
  const [helpfulFactors, setHelpfulFactors] = useState<HelpfulFactor[]>([]);
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [savedEntryId, setSavedEntryId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  function reset() {
    setEmotions([]); setMoodScore(undefined); setContexts([]); setHelpfulFactors([]); setNote(""); setSavedEntryId(null); setFeedback(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!emotions.length) { setFeedback("Choose at least one emotion that fits right now."); return; }
    setIsSaving(true); setFeedback(null);
    try {
      const now = new Date();
      const id = await createMoodEntry(uid, {
        emotions, moodScore, contexts, helpfulFactors, note, source: "MANUAL_CHECKIN",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", localDate: localDateString(now),
      });
      setSavedEntryId(id);
      await onSaved();
    } catch (error) {
      console.error("Failed to save mood entry:", error);
      setFeedback("Could not save that check-in. Try again.");
    } finally { setIsSaving(false); }
  }

  if (savedEntryId) return (
    <div className="rounded-[1.75rem] bg-gradient-to-br from-[#fff8f2] via-white to-[#edf5e9] px-5 py-8 text-center" role="status">
      <span aria-hidden="true" className="mx-auto flex size-14 items-center justify-center rounded-full bg-[#c6ebda] text-[#325347] shadow-[0_10px_24px_rgba(50,83,71,0.14)]"><span className="material-symbols-outlined">check</span></span>
      <h2 className="mt-4 text-2xl font-medium text-[#325347]">Your check-in is saved.</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#596c60]">Would talking it through feel useful? Momo can use the emotions and contexts you selected as quiet background for your next message.</p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row"><Link className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#325347] px-6 py-3 text-sm font-medium text-white" href={`/momo?checkInId=${encodeURIComponent(savedEntryId)}`}>Talk to Momo</Link><Button onClick={reset} variant="secondary">Maybe later</Button></div>
    </div>
  );

  return (
    <form onSubmit={handleSubmit}>
      <div className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-r from-[#fff1e8] via-[#fffaf5] to-[#edf4e9] p-5 sm:p-6"><span aria-hidden="true" className="absolute -right-6 -top-7 size-24 rounded-full bg-[#ffdcbf]/45 blur-sm" /><span aria-hidden="true" className="absolute -bottom-8 right-24 size-20 rounded-full bg-[#c6ebda]/45 blur-sm" /><div className="relative flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#795841]">A moment for you</p><h2 className="mt-2 text-2xl font-medium tracking-[-0.035em] text-[#325347] sm:text-3xl">How are you feeling?</h2><p className="mt-2 text-sm leading-6 text-[#596c60]">Start with the words that fit. Everything after that is optional.</p></div><span className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/70 px-3 py-2 text-xs text-[#526753] shadow-sm backdrop-blur-sm"><span aria-hidden="true" className="material-symbols-outlined !text-base">schedule</span>Quick check-in</span></div></div>
      <div className="mt-7"><EmotionSelector onChange={setEmotions} value={emotions} /></div>
      {emotions.length ? <fieldset className="mt-6"><legend className="font-medium text-[#414845]">How strong does each feeling feel? <span className="font-normal text-[#596c60]">(optional)</span></legend><div className="mt-3 grid gap-3 sm:grid-cols-2">{emotions.map((item) => <EmotionIntensityControl item={item} key={item.emotion} onChange={(intensity) => setEmotions((current) => current.map((candidate) => candidate.emotion === item.emotion ? { emotion: candidate.emotion, ...(intensity !== undefined ? { intensity } : {}) } : candidate))} />)}</div></fieldset> : null}
      <div className="mt-6"><MoodContextSelector onChange={setContexts} value={contexts} /></div>
      <label className="mt-6 block"><span className="font-medium text-[#414845]">Anything else you want to remember? <span className="font-normal text-[#596c60]">(optional)</span></span><Textarea className="mt-2 min-h-24 rounded-[1rem] bg-white px-4 py-3 text-sm shadow-none" maxLength={1000} onChange={(event) => setNote(event.target.value)} placeholder="This stays with this check-in. It is separate from your encrypted journal." rows={3} value={note} /><span className="mt-1 block text-right text-xs text-[#596c60]">{note.length}/1,000</span></label>
      <details className="group/context mt-5 rounded-2xl border border-[#eaded4] bg-gradient-to-br from-white/70 to-[#fff5ed]/70 px-4 open:pb-5 sm:px-5"><summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-xl py-3 text-sm font-medium text-[#325347] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#325347] [&::-webkit-details-marker]:hidden"><span>Add an overall mood or what helped <span className="font-normal text-[#596c60]">(optional)</span></span><span aria-hidden="true" className="material-symbols-outlined transition-transform group-open/context:rotate-180">expand_more</span></summary><fieldset className="mt-3"><legend className="text-sm font-medium text-[#414845]">Overall mood</legend><div className="mt-2 grid grid-cols-5 gap-2">{moodScores.map((score) => <button aria-label={`Overall mood ${score} out of 10`} aria-pressed={moodScore === score} className={`min-h-11 rounded-xl border text-sm font-medium transition hover:-translate-y-0.5 hover:shadow-sm motion-reduce:hover:translate-y-0 ${moodScore === score ? moodScoreTones[score] : "border-[#e5e8df] bg-white text-[#596c60] hover:bg-[#faf9f5]"}`} key={score} onClick={() => setMoodScore(moodScore === score ? undefined : score)} type="button">{score}</button>)}</div></fieldset><fieldset className="mt-5"><legend className="text-sm font-medium text-[#414845]">Anything helping today?</legend><div className="mt-3 flex flex-wrap gap-2">{HELPFUL_FACTORS.map((factor) => <button aria-pressed={helpfulFactors.includes(factor)} className={`min-h-11 rounded-full border px-4 py-2 text-sm transition hover:-translate-y-0.5 hover:shadow-sm motion-reduce:hover:translate-y-0 ${helpfulFactors.includes(factor) ? "border-[#d6a987] bg-[#ffe3cd] text-[#673c27]" : "border-[#e7d8ce] bg-white text-[#414845] hover:bg-[#fff8f2]"}`} key={factor} onClick={() => setHelpfulFactors((current) => toggleValue(current, factor, 10))} type="button">{HELPFUL_FACTOR_LABELS[factor]}</button>)}</div></fieldset></details>
      <div className="mt-6 flex flex-col-reverse items-stretch justify-between gap-4 border-t border-[#ecebe3] pt-5 sm:flex-row sm:items-center">{feedback ? <p className="rounded-2xl bg-[#ffdad6] px-4 py-2 text-sm text-[#93000a]" role="alert">{feedback}</p> : <p className="text-center text-xs text-[#657267] sm:text-left">Intensities, context, note, and overall mood are optional.</p>}<Button className="min-h-12 shrink-0 sm:min-w-44" isLoading={isSaving} type="submit">Save check-in<span aria-hidden="true" className="material-symbols-outlined !text-lg">arrow_forward</span></Button></div>
    </form>
  );
}
