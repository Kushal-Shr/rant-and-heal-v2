"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Timestamp } from "firebase/firestore";
import { Textarea } from "@/src/components/forms/Textarea";
import { Button } from "@/src/components/ui/Button";
import { Spinner } from "@/src/components/ui/Spinner";
import { useAuth } from "@/src/context/AuthContext";
import { createMoodEntry, listMoodEntries } from "@/src/services/moodService";
import { listJournalEntries } from "@/src/services/journalService";
import { JournalEntry, MoodEntry, ServerTime } from "@/src/types/database";

const scoreFields = [
  { key: "moodScore", label: "Mood", accent: "bg-[#abcebf]" },
  { key: "anxietyScore", label: "Anxiety", accent: "bg-[#ffd86b]" },
  { key: "energyScore", label: "Energy", accent: "bg-[#e1d4ff]" },
] as const;

type ScoreKey = (typeof scoreFields)[number]["key"];
type Scores = Record<ScoreKey, number>;

function formatDate(value: ServerTime | undefined) {
  if (value instanceof Timestamp) {
    return value.toDate().toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }

  return "Today";
}

function isValidScore(value: number) {
  return Number.isInteger(value) && value >= 1 && value <= 10;
}

export default function PatientDashboardPage() {
  const { user, loading } = useAuth();
  const [scores, setScores] = useState<Scores>({
    moodScore: 6,
    anxietyScore: 4,
    energyScore: 5,
  });
  const [note, setNote] = useState("");
  const [moodEntries, setMoodEntries] = useState<MoodEntry[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  async function loadDashboardData(uid: string) {
    const [moods, journals] = await Promise.all([
      listMoodEntries(uid, 7),
      listJournalEntries(uid),
    ]);
    setMoodEntries(moods);
    setJournalEntries(journals.slice(0, 3));
  }

  async function refreshDashboard(uid: string) {
    try {
      setIsFetching(true);
      await loadDashboardData(uid);
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
      setFeedback({ type: "error", message: "Could not load your latest entries." });
    } finally {
      setIsFetching(false);
    }
  }

  useEffect(() => {
    if (!loading && user) {
      Promise.all([listMoodEntries(user.uid, 7), listJournalEntries(user.uid)])
        .then(([moods, journals]) => {
          setMoodEntries(moods);
          setJournalEntries(journals.slice(0, 3));
        })
        .catch((error) => {
          console.error("Failed to load dashboard data:", error);
          setFeedback({ type: "error", message: "Could not load your latest entries." });
        })
        .finally(() => {
          setIsFetching(false);
        });
    }
  }, [loading, user]);

  const averages = useMemo(() => {
    if (moodEntries.length === 0) {
      return null;
    }

    return scoreFields.map((field) => {
      const total = moodEntries.reduce((sum, entry) => sum + entry[field.key], 0);
      return {
        ...field,
        value: Math.round((total / moodEntries.length) * 10) / 10,
      };
    });
  }, [moodEntries]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user) {
      return;
    }

    if (!scoreFields.every((field) => isValidScore(scores[field.key]))) {
      setFeedback({ type: "error", message: "Scores need to be whole numbers from 1 to 10." });
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      await createMoodEntry(user.uid, {
        ...scores,
        note,
      });
      setNote("");
      setFeedback({ type: "success", message: "Mood check-in saved." });
      await refreshDashboard(user.uid);
    } catch (error) {
      console.error("Failed to save mood entry:", error);
      setFeedback({ type: "error", message: "Could not save that check-in. Try again." });
    } finally {
      setIsSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Spinner size="lg" label="Loading dashboard" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-6 font-['Plus_Jakarta_Sans'] text-[#2c1601]">
      <header className="border-2 border-[#2c1601] bg-[#fff8f5] p-6 shadow-[8px_8px_0_#abcebf]">
        <p className="text-sm font-bold uppercase text-[#4a6b5e]">Daily check-in</p>
        <h1 className="mt-2 text-3xl font-black">How are things in there today?</h1>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <form
          className="space-y-5 border-2 border-[#2c1601] bg-white p-6 shadow-[8px_8px_0_#ffd86b]"
          onSubmit={handleSubmit}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            {scoreFields.map((field) => (
              <label className="block" key={field.key}>
                <span className="text-sm font-extrabold">{field.label}</span>
                <span className={`mt-2 block border-2 border-[#2c1601] p-4 ${field.accent}`}>
                  <input
                    className="w-full accent-[#325347]"
                    max={10}
                    min={1}
                    onChange={(event) =>
                      setScores((current) => ({
                        ...current,
                        [field.key]: Number(event.target.value),
                      }))
                    }
                    type="range"
                    value={scores[field.key]}
                  />
                  <span className="mt-3 block text-3xl font-black">{scores[field.key]}/10</span>
                </span>
              </label>
            ))}
          </div>

          <label className="block">
            <span className="text-sm font-extrabold">Optional note</span>
            <Textarea
              className="mt-2 rounded-none border-2 border-[#2c1601] bg-[#fff8f5] shadow-none"
              onChange={(event) => setNote(event.target.value)}
              placeholder="One honest sentence is enough."
              rows={4}
              value={note}
            />
          </label>

          {feedback ? (
            <p
              className={`border-2 border-[#2c1601] px-4 py-3 text-sm font-bold ${
                feedback.type === "success" ? "bg-[#abcebf]" : "bg-[#ffdad6]"
              }`}
            >
              {feedback.message}
            </p>
          ) : null}

          <Button
            className="rounded-none border-2 border-[#2c1601] shadow-[4px_4px_0_#2c1601]"
            isLoading={isSaving}
            type="submit"
          >
            Save check-in
          </Button>
        </form>

        <aside className="border-2 border-[#2c1601] bg-[#e1d4ff] p-6 shadow-[8px_8px_0_#2c1601]">
          <h2 className="text-xl font-black">Recent mood trend</h2>
          {isFetching ? (
            <div className="mt-8">
              <Spinner label="Loading mood entries" />
            </div>
          ) : averages ? (
            <div className="mt-5 grid gap-3">
              {averages.map((item) => (
                <div className="border-2 border-[#2c1601] bg-white p-4" key={item.key}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-extrabold">{item.label}</span>
                    <span className="text-2xl font-black">{item.value}/10</span>
                  </div>
                  <div className="mt-3 h-4 border-2 border-[#2c1601] bg-[#fff8f5]">
                    <div
                      className={`h-full ${item.accent}`}
                      style={{ width: `${item.value * 10}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 border-2 border-[#2c1601] bg-white p-4 font-bold">
              No entries yet. Start with one honest sentence.
            </p>
          )}
        </aside>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="border-2 border-[#2c1601] bg-white p-6 shadow-[8px_8px_0_#abcebf]">
          <h2 className="text-xl font-black">Latest check-ins</h2>
          <div className="mt-4 space-y-3">
            {moodEntries.length > 0 ? (
              moodEntries.slice(0, 4).map((entry) => (
                <article className="border-2 border-[#2c1601] bg-[#fff8f5] p-4" key={entry.id}>
                  <div className="flex flex-wrap items-center gap-3 text-sm font-extrabold">
                    <span>{formatDate(entry.createdAt)}</span>
                    <span>Mood {entry.moodScore}</span>
                    <span>Anxiety {entry.anxietyScore}</span>
                    <span>Energy {entry.energyScore}</span>
                  </div>
                  {entry.note ? <p className="mt-2 text-sm leading-6">{entry.note}</p> : null}
                </article>
              ))
            ) : (
              <p className="border-2 border-[#2c1601] bg-[#fff8f5] p-4 font-bold">
                No entries yet. Start with one honest sentence.
              </p>
            )}
          </div>
        </div>

        <div className="border-2 border-[#2c1601] bg-[#ffd86b] p-6 shadow-[8px_8px_0_#2c1601]">
          <h2 className="text-xl font-black">Recent journal preview</h2>
          <div className="mt-4 space-y-3">
            {journalEntries.length > 0 ? (
              journalEntries.map((entry) => (
                <article className="border-2 border-[#2c1601] bg-white p-4" key={entry.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-black">{entry.title}</h3>
                    {entry.moodTag ? (
                      <span className="border-2 border-[#2c1601] bg-[#e1d4ff] px-2 py-1 text-xs font-black">
                        {entry.moodTag}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-6">{entry.body}</p>
                </article>
              ))
            ) : (
              <p className="border-2 border-[#2c1601] bg-white p-4 font-bold">
                No entries yet. Start with one honest sentence.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
