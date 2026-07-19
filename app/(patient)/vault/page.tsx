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
    <div className="space-y-6 font-['Plus_Jakarta_Sans'] text-[#2c1601]">
      <header className="border-2 border-[#2c1601] bg-[#fff8f5] p-6 shadow-[8px_8px_0_#e1d4ff]">
        <p className="text-sm font-bold uppercase text-[#4a6b5e]">Plaintext journal</p>
        <h1 className="mt-2 text-3xl font-black">Write what happened. Keep what matters.</h1>
      </header>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <form
          className="space-y-4 border-2 border-[#2c1601] bg-white p-6 shadow-[8px_8px_0_#abcebf]"
          onSubmit={handleSubmit}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-black">{editingId ? "Edit entry" : "New entry"}</h2>
            {editingId ? (
              <Button
                className="rounded-none border-2 border-[#2c1601] px-4 py-2 shadow-[3px_3px_0_#2c1601]"
                onClick={cancelEditing}
                variant="ghost"
              >
                Cancel
              </Button>
            ) : null}
          </div>

          <label className="block">
            <span className="text-sm font-extrabold">Title</span>
            <Input
              className="mt-2 rounded-none border-2 border-[#2c1601] bg-[#fff8f5] shadow-none"
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="Name the feeling"
              value={form.title}
            />
          </label>

          <label className="block">
            <span className="text-sm font-extrabold">Mood tag</span>
            <Input
              className="mt-2 rounded-none border-2 border-[#2c1601] bg-[#e1d4ff] shadow-none"
              onChange={(event) =>
                setForm((current) => ({ ...current, moodTag: event.target.value }))
              }
              placeholder="raw, calm, angry, hopeful"
              value={form.moodTag}
            />
          </label>

          <label className="block">
            <span className="text-sm font-extrabold">Body</span>
            <Textarea
              className="mt-2 rounded-none border-2 border-[#2c1601] bg-[#fff8f5] shadow-none"
              lined
              onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
              placeholder="No polish. Just the truth."
              rows={10}
              value={form.body}
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
            {editingId ? "Update entry" : "Save entry"}
          </Button>
        </form>

        <div className="border-2 border-[#2c1601] bg-[#ffd86b] p-6 shadow-[8px_8px_0_#2c1601]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-black">Your entries</h2>
            <span className="border-2 border-[#2c1601] bg-white px-3 py-1 text-sm font-black">
              {entries.length}
            </span>
          </div>

          {isFetching ? (
            <div className="mt-8">
              <Spinner label="Loading journal entries" />
            </div>
          ) : entries.length > 0 ? (
            <div className="mt-5 space-y-4">
              {entries.map((entry) => (
                <article className="border-2 border-[#2c1601] bg-white p-4" key={entry.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-black">{entry.title}</h3>
                      <p className="mt-1 text-xs font-bold uppercase text-[#4a6b5e]">
                        {formatDate(entry.createdAt)}
                      </p>
                    </div>
                    {entry.moodTag ? (
                      <span className="border-2 border-[#2c1601] bg-[#e1d4ff] px-2 py-1 text-xs font-black">
                        {entry.moodTag}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{entry.body}</p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button
                      className="rounded-none border-2 border-[#2c1601] px-4 py-2 shadow-[3px_3px_0_#2c1601]"
                      onClick={() => startEditing(entry)}
                      variant="secondary"
                    >
                      Edit
                    </Button>
                    <Button
                      className="rounded-none border-2 border-[#2c1601] px-4 py-2 shadow-[3px_3px_0_#2c1601]"
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
            <p className="mt-5 border-2 border-[#2c1601] bg-white p-4 font-bold">
              No entries yet. Start with one honest sentence.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
