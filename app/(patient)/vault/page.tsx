"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Timestamp } from "firebase/firestore";
import { Input } from "@/src/components/forms/Input";
import { Textarea } from "@/src/components/forms/Textarea";
import { Button } from "@/src/components/ui/Button";
import { Spinner } from "@/src/components/ui/Spinner";
import { useAuth } from "@/src/context/AuthContext";
import { useVault } from "@/src/context/VaultContext";
import { migrateLegacyJournalEntries } from "@/src/lib/journal/migration";
import {
  JOURNAL_CONTEXTS,
  JOURNAL_EMOTIONS,
  JOURNAL_INTENTS,
  type DecryptedJournalEntry,
  type JournalContext,
  type JournalEmotion,
  type JournalIntent,
} from "@/src/lib/journal/schemas";
import {
  createJournalEntry,
  deleteJournalEntry,
  listJournalEntries,
  updateJournalEntry,
} from "@/src/services/journalService";
import type { ServerTime } from "@/src/types/database";

interface JournalForm {
  title: string;
  body: string;
  emotions: JournalEmotion[];
  contexts: JournalContext[];
  intent?: JournalIntent;
}

const emptyForm: JournalForm = { title: "", body: "", emotions: [], contexts: [] };
const labelFor = (value: string) => value.toLowerCase().replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());

function formatDate(value: ServerTime | undefined) {
  return value instanceof Timestamp
    ? value.toDate().toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "Just now";
}

function ChoiceGroup<T extends string>({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: readonly T[];
  selected: T[];
  onChange(values: T[]): void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-[#414845]">{label} <span className="font-light text-[#717974]">(optional)</span></legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => {
          const active = selected.includes(option);
          return <button aria-pressed={active} className={`rounded-full px-3 py-2 text-xs ${active ? "bg-[#325347] text-white" : "bg-[#fff1e8] text-[#414845]"}`} key={option} onClick={() => onChange(active ? selected.filter((item) => item !== option) : [...selected, option])} type="button">{labelFor(option)}</button>;
        })}
      </div>
    </fieldset>
  );
}

export default function VaultPage() {
  const { user, loading: authLoading } = useAuth();
  const { state, key, createVault, unlockVault, lockVault } = useVault();
  const [entries, setEntries] = useState<DecryptedJournalEntry[]>([]);
  const [form, setForm] = useState<JournalForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const refreshEntries = useCallback(async (uid: string, vaultKey: CryptoKey) => {
    setIsFetching(true);
    try {
      setEntries(await listJournalEntries(uid, vaultKey));
    } finally {
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    if (!user || !key) return;
    let current = true;
    void (async () => {
      setIsFetching(true);
      const migration = await migrateLegacyJournalEntries(user.uid, key);
      if (!current) return;
      if (migration.failedIds.length) {
        setFeedback({ type: "error", message: `Some older entries could not be secured yet: ${migration.failedIds.join(", ")}` });
      } else if (migration.migratedIds.length) {
        setFeedback({ type: "success", message: `${migration.migratedIds.length} older ${migration.migratedIds.length === 1 ? "entry was" : "entries were"} encrypted.` });
      }
      setEntries(await listJournalEntries(user.uid, key));
      if (current) setIsFetching(false);
    })().catch(() => {
      if (current) {
        setIsFetching(false);
        setFeedback({ type: "error", message: "Could not open your journal entries." });
      }
    });
    return () => { current = false; };
  }, [key, user]);

  async function handleVaultAccess(event: FormEvent) {
    event.preventDefault();
    if (passphrase.length < 10) {
      setFeedback({ type: "error", message: "Use a Vault passphrase of at least 10 characters." });
      return;
    }
    if (state === "NOT_CREATED" && passphrase !== confirmation) {
      setFeedback({ type: "error", message: "The passphrases do not match." });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      if (state === "NOT_CREATED") await createVault(passphrase);
      else await unlockVault(passphrase);
      setPassphrase("");
      setConfirmation("");
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Could not unlock the Vault." });
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !key) return;
    if (!form.title.trim() || !form.body.trim()) {
      setFeedback({ type: "error", message: "A title and one honest sentence are required." });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const input = {
        title: form.title,
        body: form.body,
        userReported: { emotions: form.emotions, contexts: form.contexts, intent: form.intent },
      };
      if (editingId) {
        const existing = entries.find((entry) => entry.id === editingId);
        if (!existing?.metric) throw new Error("This entry's safe metrics are unavailable.");
        await updateJournalEntry(user.uid, editingId, key, input, existing.createdAt, existing.metric.behavior);
        setFeedback({ type: "success", message: "Journal entry encrypted and updated." });
      } else {
        await createJournalEntry(user.uid, key, input);
        setFeedback({ type: "success", message: "Journal entry encrypted and saved." });
      }
      setForm(emptyForm);
      setEditingId(null);
      await refreshEntries(user.uid, key);
    } catch {
      setFeedback({ type: "error", message: "Could not save that entry. Your draft remains on this device." });
    } finally {
      setBusy(false);
    }
  }

  function startEditing(entry: DecryptedJournalEntry) {
    setEditingId(entry.id);
    setForm({
      title: entry.title,
      body: entry.body,
      emotions: entry.userReported?.emotions ?? [],
      contexts: entry.userReported?.contexts ?? [],
      intent: entry.userReported?.intent,
    });
    setFeedback(null);
  }

  async function handleDelete(entryId: string) {
    if (!user || !window.confirm("Delete this journal entry permanently? This cannot be undone.")) return;
    setDeletingId(entryId);
    try {
      await deleteJournalEntry(user.uid, entryId);
      if (editingId === entryId) { setEditingId(null); setForm(emptyForm); }
      setEntries((current) => current.filter((entry) => entry.id !== entryId));
      setFeedback({ type: "success", message: "Journal entry and its metrics were deleted." });
    } catch {
      setFeedback({ type: "error", message: "Could not delete that entry." });
    } finally {
      setDeletingId(null);
    }
  }

  if (authLoading || state === "LOADING") return <div className="flex min-h-[70vh] items-center justify-center"><Spinner size="lg" label="Loading vault" /></div>;
  if (!user) return null;

  if (state !== "UNLOCKED") {
    return <div className="mx-auto max-w-xl py-12">
      <section className="rounded-[2.5rem] border border-white/80 bg-white/75 p-8 shadow-xl">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#4a6b5e]">{state === "NOT_CREATED" ? "Create your encrypted Vault" : "Vault locked"}</p>
        <h1 className="mt-3 text-4xl font-medium text-[#2c1601]">Your words stay yours.</h1>
        <p className="mt-4 text-sm leading-6 text-[#414845]">Your journal text is encrypted in this browser before it is saved. It is not shared with Momo or your therapist. Weekly insights may use coarse activity and only the labels you choose.</p>
        <form className="mt-7 space-y-4" onSubmit={handleVaultAccess}>
          <label className="block"><span className="text-sm font-medium">Vault passphrase</span><Input autoComplete="off" className="mt-2" onChange={(event) => setPassphrase(event.target.value)} type="password" value={passphrase} /></label>
          {state === "NOT_CREATED" ? <label className="block"><span className="text-sm font-medium">Confirm passphrase</span><Input autoComplete="off" className="mt-2" onChange={(event) => setConfirmation(event.target.value)} type="password" value={confirmation} /></label> : null}
          <p className="text-xs leading-5 text-[#717974]">On this browser, your non-extractable encryption key can stay trusted for 14 days. Locking the Vault, signing out, clearing site data, or reaching the expiry requires the passphrase again. There is no passphrase recovery during the pilot.</p>
          {feedback ? <p className="rounded-2xl bg-[#ffdad6] px-4 py-3 text-sm text-[#93000a]" role="status">{feedback.message}</p> : null}
          <Button isLoading={busy} type="submit">{state === "NOT_CREATED" ? "Create Vault" : "Unlock Vault"}</Button>
        </form>
      </section>
    </div>;
  }

  return <div className="mx-auto max-w-6xl space-y-6 pb-10">
    <header className="flex flex-wrap items-end justify-between gap-5 px-1 pt-3">
      <div><p className="text-xs font-medium uppercase tracking-[0.12em] text-[#4a6b5e]/70">Encrypted in your browser</p><h1 className="mt-2 text-4xl font-medium text-[#2c1601]">Your journal</h1><p className="mt-3 text-sm text-[#414845]">Journal text is not shared with Momo or your therapist.</p></div>
      <div className="flex gap-2"><Button onClick={() => { setEditingId(null); setForm(emptyForm); }}>New entry</Button><Button onClick={() => { void lockVault(); setEntries([]); setForm(emptyForm); setEditingId(null); }} variant="outline">Lock Vault</Button></div>
    </header>
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.6fr)]">
      <form className="space-y-5 rounded-[2.5rem] border border-white/80 bg-white/75 p-6 shadow-xl sm:p-8" onSubmit={handleSubmit}>
        <h2 className="text-2xl font-medium text-[#325347]">{editingId ? "Edit this entry" : "Let it out"}</h2>
        <label className="block"><span className="text-sm font-medium">Title</span><Input className="mt-2 bg-[#fff1e8]" maxLength={160} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} value={form.title} /></label>
        <label className="block"><span className="text-sm font-medium">What&apos;s on your mind?</span><Textarea className="mt-2 min-h-72 bg-[#fff1e8]" maxLength={20000} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} rows={13} value={form.body} /></label>
        <ChoiceGroup label="Emotions you choose to attach" onChange={(emotions) => setForm((current) => ({ ...current, emotions }))} options={JOURNAL_EMOTIONS} selected={form.emotions} />
        <ChoiceGroup label="Contexts you choose to attach" onChange={(contexts) => setForm((current) => ({ ...current, contexts }))} options={JOURNAL_CONTEXTS} selected={form.contexts} />
        <label className="block text-sm font-medium">What would help? <span className="font-light text-[#717974]">(optional)</span><select className="mt-2 block w-full rounded-full bg-[#fff1e8] px-4 py-3" onChange={(event) => setForm((current) => ({ ...current, intent: (event.target.value || undefined) as JournalIntent | undefined }))} value={form.intent ?? ""}><option value="">No selection</option>{JOURNAL_INTENTS.map((intent) => <option key={intent} value={intent}>{labelFor(intent)}</option>)}</select></label>
        <p className="text-xs leading-5 text-[#717974]">Selections are reported as choices you made, never as AI-detected facts. Your text is used locally only to choose a coarse length bucket.</p>
        {feedback ? <p className={`rounded-2xl px-4 py-3 text-sm ${feedback.type === "success" ? "bg-[#c6ebda] text-[#002117]" : "bg-[#ffdad6] text-[#93000a]"}`} role="status">{feedback.message}</p> : null}
        <div className="flex gap-2"><Button isLoading={busy} type="submit">{editingId ? "Encrypt update" : "Encrypt and save"}</Button>{editingId ? <Button onClick={() => { setEditingId(null); setForm(emptyForm); }} variant="ghost">Cancel</Button> : null}</div>
      </form>
      <aside className="rounded-[2.5rem] bg-[#ffe3cd]/70 p-6 sm:p-7">
        <div className="flex items-center justify-between"><h2 className="text-2xl font-medium text-[#795841]">Your notes</h2><span className="rounded-full bg-white/80 px-3 py-1 text-sm">{entries.length}</span></div>
        {isFetching ? <div className="mt-8"><Spinner label="Decrypting journal entries" /></div> : <div className="mt-6 space-y-4">{entries.map((entry) => <article className="rounded-[1.75rem] bg-white/80 p-5" key={entry.id}><h3 className="text-lg font-medium text-[#2c1601]">{entry.title}</h3><p className="mt-1 text-xs uppercase tracking-[0.1em] text-[#4a6b5e]">{formatDate(entry.createdAt)}</p>{entry.legacyMoodTag ? <p className="mt-2 text-xs text-[#795841]">Legacy private tag: {entry.legacyMoodTag}</p> : null}<p className="mt-3 whitespace-pre-wrap text-sm leading-6">{entry.body}</p><div className="mt-4 flex gap-2"><Button className="px-4 py-2" onClick={() => startEditing(entry)} variant="secondary">Edit</Button><Button className="px-4 py-2" isLoading={deletingId === entry.id} onClick={() => void handleDelete(entry.id)} variant="danger">Delete</Button></div></article>)}{!entries.length ? <p className="rounded-[1.75rem] bg-white/80 p-5 text-sm">Nothing written yet.</p> : null}</div>}
      </aside>
    </section>
  </div>;
}
