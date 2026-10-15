"use client";

import { useState } from "react";
import { MOOD_EMOTION_VISUALS } from "@/src/components/mood/emotionStyles";
import { Button } from "@/src/components/ui/Button";
import { MOOD_EMOTION_LABELS, MOOD_EMOTIONS, type MoodEmotion } from "@/src/lib/mood/schema";
import { createMoodEntry } from "@/src/services/moodService";

const usefulnessTones = [
  "bg-[#ffdad6] text-[#83000a]",
  "bg-[#ffe3cd] text-[#673c27]",
  "bg-[#fff0bf] text-[#594415]",
  "bg-[#e4ecd9] text-[#40572f]",
  "bg-[#c6ebda] text-[#244b3d]",
] as const;

function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function PostMomoCheckIn({ uid, conversationId, baselineCheckInId, onSaved }: {
  uid: string;
  conversationId: string;
  baselineCheckInId?: string;
  onSaved: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [emotion, setEmotion] = useState<MoodEmotion>();
  const [intensity, setIntensity] = useState<number>();
  const [usefulness, setUsefulness] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function save() {
    if (!emotion) { setFeedback("Choose the emotion that feels closest right now."); return; }
    setBusy(true); setFeedback("");
    try {
      const now = new Date();
      await createMoodEntry(uid, {
        emotions: [{ emotion, ...(intensity !== undefined ? { intensity } : {}) }],
        source: "POST_SESSION", usefulnessRating: usefulness, conversationId, baselineCheckInId,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", localDate: localDateString(now),
      });
      onSaved();
    } catch {
      setFeedback("Could not save this check-in. You can try again or skip it.");
    } finally { setBusy(false); }
  }

  if (!expanded) return <div><p className="text-sm leading-6 text-[#2d4d41]/80">You&apos;ve spent a little time here. If you want, notice how you feel now.</p><Button className="mt-4 w-full" onClick={() => setExpanded(true)} variant="secondary">How am I feeling now?</Button><p className="mt-2 text-center text-xs text-[#657267]">Optional</p></div>;

  return <div>
    <p className="text-sm font-medium text-[#325347]">How are you feeling now?</p>
    <div className="mt-3 flex max-h-44 flex-wrap gap-2 overflow-y-auto">{MOOD_EMOTIONS.map((item) => { const visual = MOOD_EMOTION_VISUALS[item]; return <button aria-pressed={emotion === item} className={`flex min-h-11 items-center gap-1.5 rounded-full border px-3 py-2 text-xs transition hover:-translate-y-0.5 hover:shadow-sm motion-reduce:hover:translate-y-0 ${emotion === item ? visual.selected : visual.idle}`} key={item} onClick={() => setEmotion(item)} type="button"><span aria-hidden="true" className="material-symbols-outlined !text-base">{visual.icon}</span>{MOOD_EMOTION_LABELS[item]}</button>; })}</div>
    <label className="mt-4 block text-xs text-[#526753]">Intensity <span className="text-[#657267]">(optional)</span><div className="mt-1 flex items-center gap-2"><input aria-label="Current emotion intensity" className="h-11 min-w-0 flex-1 accent-[#325347]" max="10" min="1" onChange={(event) => setIntensity(Number(event.target.value))} type="range" value={intensity ?? 5} />{intensity === undefined ? <button className="min-h-11 px-2 underline" onClick={() => setIntensity(5)} type="button">Add</button> : <output className="w-10 text-right">{intensity}/10</output>}</div></label>
    <fieldset className="mt-3"><legend className="text-xs text-[#526753]">Was this conversation useful? <span className="text-[#657267]">(optional)</span></legend><div className="mt-2 grid grid-cols-5 gap-1">{[1, 2, 3, 4, 5].map((rating) => <button aria-label={`Usefulness ${rating} out of 5`} aria-pressed={usefulness === rating} className={`min-h-11 rounded-xl border border-white/70 text-xs font-medium transition hover:-translate-y-0.5 hover:shadow-sm motion-reduce:hover:translate-y-0 ${usefulness === rating ? usefulnessTones[rating - 1] : "bg-white/65 text-[#526753]"}`} key={rating} onClick={() => setUsefulness(usefulness === rating ? undefined : rating)} type="button">{rating}</button>)}</div></fieldset>
    {feedback ? <p className="mt-3 text-xs text-[#93000a]" role="alert">{feedback}</p> : null}
    <div className="mt-4 flex gap-2"><Button className="flex-1 px-3" isLoading={busy} onClick={() => void save()}>Save</Button><Button className="px-3" onClick={onSaved} variant="ghost">Skip</Button></div>
  </div>;
}
