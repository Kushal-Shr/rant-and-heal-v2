"use client";

import { FormEvent, useEffect, useState } from "react";
import { Timestamp } from "firebase/firestore";
import { Input } from "@/src/components/forms/Input";
import { Textarea } from "@/src/components/forms/Textarea";
import { Button } from "@/src/components/ui/Button";
import { Spinner } from "@/src/components/ui/Spinner";
import { useAuth } from "@/src/context/AuthContext";
import {
  createJournalEntry,
  deleteJournalEntry,
  listJournalEntries,
  updateJournalEntry,
} from "@/src/services/journalService";
import { JournalEntry, ServerTime } from "@/src/types/database";

type JournalForm = {
  title: string;
  body: string;
  moodTag: string;
};

const emptyForm: JournalForm = {
  title: "",
  body: "",
  moodTag: "",
};

function formatDate(value: ServerTime | undefined) {
  if (value instanceof Timestamp) {
    return value.toDate().toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return "Just now";
}

export default function VaultPage() {
  const { user, loading } = useAuth();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [form, setForm] = useState<JournalForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  async function loadJournalData(uid: string) {
    setEntries(await listJournalEntries(uid));
  }

  async function refreshEntries(uid: string) {
    try {
      setIsFetching(true);
      await loadJournalData(uid);
    } catch (error) {
      console.error("Failed to load journal entries:", error);
      setFeedback({ type: "error", message: "Could not load your journal entries." });
    } finally {
      setIsFetching(false);
    }
  }

  useEffect(() => {
    if (!loading && user) {
      listJournalEntries(user.uid)
        .then((journalEntries) => {
          setEntries(journalEntries);
        })
        .catch((error) => {
          console.error("Failed to load journal entries:", error);
          setFeedback({ type: "error", message: "Could not load your journal entries." });
        })
        .finally(() => {
          setIsFetching(false);
        });
    }
  }, [loading, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user) {
      return;
    }

    if (!form.title.trim() || !form.body.trim()) {
      setFeedback({ type: "error", message: "A title and one honest sentence are required." });
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      if (editingId) {
        await updateJournalEntry(user.uid, editingId, form);
        setFeedback({ type: "success", message: "Journal entry updated." });
      } else {
        await createJournalEntry(user.uid, form);
        setFeedback({ type: "success", message: "Journal entry saved." });
      }

      setForm(emptyForm);
      setEditingId(null);
      await refreshEntries(user.uid);
    } catch (error) {
      console.error("Failed to save journal entry:", error);
      setFeedback({ type: "error", message: "Could not save that entry. Try again." });
    } finally {
      setIsSaving(false);
    }
  }

  function startEditing(entry: JournalEntry) {
    setEditingId(entry.id ?? null);
    setForm({
      title: entry.title,
      body: entry.body,
      moodTag: entry.moodTag ?? "",
    });
    setFeedback(null);
  }

  function cancelEditing() {
    setEditingId(null);
    setForm(emptyForm);
    setFeedback(null);
  }

  async function handleDelete(entryId: string) {
    if (!user) {
      return;
    }

    setDeletingId(entryId);
    setFeedback(null);

    try {
      await deleteJournalEntry(user.uid, entryId);
      if (editingId === entryId) {
        cancelEditing();
      }
      setFeedback({ type: "success", message: "Journal entry deleted." });
      await refreshEntries(user.uid);
    } catch (error) {
      console.error("Failed to delete journal entry:", error);
      setFeedback({ type: "error", message: "Could not delete that entry. Try again." });
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Spinner size="lg" label="Loading vault" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-w-0">

      <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-5 px-3 pt-3 sm:px-1">
        <div><p className="text-xs font-medium uppercase tracking-[0.12em] text-[#4a6b5e]/70">Private by design</p><h1 className="mt-2 text-4xl font-medium tracking-[-0.04em] text-[#2c1601] sm:text-5xl">Your journal</h1><p className="mt-3 text-base font-light text-[#414845]">Capture your thoughts. Keep what matters.</p></div>
        <Button onClick={cancelEditing}><span aria-hidden="true" className="material-symbols-outlined text-lg">edit</span>New entry</Button>
      </header>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.6fr)]">
        <form
          className="space-y-5 rounded-[2.5rem] border border-white/80 bg-white/75 p-6 shadow-[0_20px_40px_-20px_rgba(121,88,65,0.24),inset_0_2px_4px_rgba(255,255,255,0.85)] backdrop-blur-xl sm:p-8"
          onSubmit={handleSubmit}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-sm font-light text-[#717974]">{formatDate(undefined)}</p><h2 className="mt-1 text-2xl font-medium text-[#325347]">{editingId ? "Edit this entry" : "Let it out"}</h2></div>
            {editingId ? (
              <Button
                onClick={cancelEditing}
                variant="ghost"
              >
                Cancel
              </Button>
            ) : null}
          </div>

          <label className="block">
            <span className="text-sm font-medium text-[#414845]">Title</span>
            <Input
              className="mt-2 bg-[#fff1e8] shadow-[inset_0_3px_8px_rgba(44,22,1,0.04)]"
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="Name the feeling"
              value={form.title}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-[#414845]">Mood tag <span className="font-light text-[#717974]">(optional)</span></span>
            <Input
              className="mt-2 bg-[#fff1e8] shadow-[inset_0_3px_8px_rgba(44,22,1,0.04)]"
              onChange={(event) =>
                setForm((current) => ({ ...current, moodTag: event.target.value }))
              }
              placeholder="raw, calm, angry, hopeful"
              value={form.moodTag}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-[#414845]">What&apos;s on your mind?</span>
            <Textarea
              className="mt-2 min-h-72 rounded-[2rem] bg-[#fff1e8] px-6 py-5 text-base shadow-[inset_0_3px_10px_rgba(44,22,1,0.035)]"
              lined
              onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
              placeholder="No polish. Just the truth."
              rows={13}
              value={form.body}
            />
          </label>

          {feedback ? (
            <p
              role="status"
              className={`rounded-2xl px-4 py-3 text-sm ${
                feedback.type === "success" ? "bg-[#c6ebda] text-[#002117]" : "bg-[#ffdad6] text-[#93000a]"
              }`}
            >
              {feedback.message}
            </p>
          ) : null}

          <Button
            isLoading={isSaving}
            type="submit"
          >
            {editingId ? "Update entry" : "Save entry"}
          </Button>
        </form>

        <aside className="rounded-[2.5rem] border border-white/75 bg-[#ffe3cd]/70 p-6 shadow-[0_20px_40px_-20px_rgba(121,88,65,0.2),inset_0_2px_4px_rgba(255,255,255,0.7)] sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-xs font-medium uppercase tracking-[0.12em] text-[#795841]/70">Past entries</p><h2 className="mt-2 text-2xl font-medium text-[#795841]">Your notes</h2></div>
            <span className="rounded-full bg-white/80 px-3 py-1 text-sm font-medium text-[#795841]">
              {entries.length}
            </span>
          </div>

          {isFetching ? (
            <div className="mt-8">
              <Spinner label="Loading journal entries" />
            </div>
          ) : entries.length > 0 ? (
            <div className="mt-6 space-y-4">
              {entries.map((entry) => (
                <article className="rounded-[1.75rem] bg-white/80 p-5 shadow-[0_12px_25px_-20px_rgba(121,88,65,0.35)]" key={entry.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-medium text-[#2c1601]">{entry.title}</h3>
                      <p className="mt-1 text-xs font-medium uppercase tracking-[0.1em] text-[#4a6b5e]">
                        {formatDate(entry.createdAt)}
                      </p>
                    </div>
                    {entry.moodTag ? (
                      <span className="rounded-full bg-[#c6ebda] px-2.5 py-1 text-xs text-[#2d4d41]">
                        {entry.moodTag}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#414845]">{entry.body}</p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button
                      className="px-4 py-2"
                      onClick={() => startEditing(entry)}
                      variant="secondary"
                    >
                      Edit
                    </Button>
                    <Button
                      className="px-4 py-2"
                      isLoading={deletingId === entry.id}
                      onClick={() => entry.id && void handleDelete(entry.id)}
                      variant="danger"
                    >
                      Delete
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-6 rounded-[1.75rem] bg-white/80 p-5 text-sm leading-6 text-[#795841]">
              Nothing written yet. This space is here whenever the words arrive.
            </p>
          )}
        </aside>
      </section>
      </div>
    </div>
  );
}
