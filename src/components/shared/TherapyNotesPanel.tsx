"use client";

import { useCallback, useEffect, useState } from "react";
import { auth } from "@/src/config/firebase";
import type { NoteContent } from "@/src/lib/therapy/notes";
import { THERAPY_CONSENT_DISCLOSURE } from "@/src/lib/therapy/consent";
import { acceptTherapyAiConsent } from "@/src/services/connectionService";

type Note = { id: string; status: "AI_DRAFT" | "THERAPIST_REVIEWED"; source: string; periodStart: number; periodEnd: number; content: NoteContent };
const fields: { key: keyof Omit<NoteContent, "evidence">; label: string }[] = [
  { key: "summary", label: "What did you focus on?" },
  { key: "userReportedConcerns", label: "Concerns the user discussed" },
  { key: "topicsDiscussed", label: "Topics discussed" },
  { key: "strategiesDiscussed", label: "Strategies discussed" },
  { key: "goalsAgreed", label: "Goals agreed" },
  { key: "followUpItems", label: "Follow-up items" },
];
const emptyContent: NoteContent = { summary: "", userReportedConcerns: [], topicsDiscussed: [], strategiesDiscussed: [], goalsAgreed: [], followUpItems: [], evidence: [] };

async function api(path: string, body?: unknown) {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in to view session notes");
  const response = await fetch(path, { method: body ? "POST" : "GET", cache: "no-store",
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error ?? "Session notes are unavailable");
  return result;
}

export function TherapyNotesPanel({ relationshipId, isTherapist, callId }: { relationshipId: string; isTherapist: boolean; callId?: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<NoteContent>(emptyContent);
  const [callInput, setCallInput] = useState({ focus: "", userConcerns: "", strategies: "", goals: "", followUp: "" });
  const [busy, setBusy] = useState(false);
  const [textWindowHours, setTextWindowHours] = useState(24);
  const [consentCurrent, setConsentCurrent] = useState(true);
  const [consentChecked, setConsentChecked] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const result = await api(`/api/therapy/notes?relationshipId=${encodeURIComponent(relationshipId)}`);
    setNotes(result.notes);
    setConsentCurrent(result.consentCurrent === true);
  }, [relationshipId]);
  useEffect(() => { queueMicrotask(() => void refresh().catch(() => setError("Could not load session notes."))); }, [refresh]);

  async function act(body: unknown) {
    setBusy(true); setError("");
    try { await api("/api/therapy/notes", { relationshipId, ...(body as Record<string, unknown>) }); await refresh(); setEditing(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save note."); }
    finally { setBusy(false); }
  }
  async function generateText() {
    const end = new Date();
    const start = new Date(end.getTime() - textWindowHours * 3600000);
    await act({ action: "GENERATE_TEXT", periodStart: start.toISOString(), periodEnd: end.toISOString() });
  }

  return <section className="rounded-2xl border border-[#c6ebda] bg-white/85 p-4 text-sm text-[#325347]">
    <h2 className="font-semibold">Shared session notes</h2>
    <p className="mt-1 text-xs">AI drafts require therapist review before they become shared reviewed notes.</p>
    {!consentCurrent ? <div className="mt-3 rounded-xl border p-3">
      <p>{isTherapist ? "The patient needs to accept the AI session-note disclosure before AI processing can start." : THERAPY_CONSENT_DISCLOSURE}</p>
      {!isTherapist ? <><label className="mt-2 flex gap-2"><input type="checkbox" checked={consentChecked} onChange={(event) => setConsentChecked(event.target.checked)} /> I understand and consent</label>
        <button className="mt-2 rounded-full bg-[#325347] px-4 py-2 text-white disabled:opacity-50" disabled={!consentChecked || busy} onClick={() => {
          setBusy(true); setError("");
          void acceptTherapyAiConsent(relationshipId).then(refresh).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not save consent"))
            .finally(() => setBusy(false));
        }}>Accept AI disclosure</button></> : null}
    </div> : null}
    {isTherapist && !callId ? <div className="mt-3 flex flex-wrap items-center gap-2"><label>Chat window <select className="rounded-lg border p-2" value={textWindowHours} onChange={(event) => setTextWindowHours(Number(event.target.value))}><option value={1}>Last hour</option><option value={6}>Last 6 hours</option><option value={24}>Last 24 hours</option></select></label><button className="rounded-full bg-[#325347] px-4 py-2 text-white disabled:opacity-50" disabled={busy || !consentCurrent} onClick={() => void generateText()}>Generate draft</button></div> : null}
    {isTherapist && callId ? <div className="mt-3 space-y-2">
      <h3 className="font-medium">Add session summary</h3>
      {([ ["focus", "What did you focus on?"], ["userConcerns", "Concerns the user discussed"], ["strategies", "Strategies discussed"], ["goals", "Goals agreed"], ["followUp", "Follow-up items"] ] as const).map(([key, label]) =>
        <label className="block" key={key}>{label}<textarea className="mt-1 block w-full rounded-xl border p-2" value={callInput[key]} onChange={(event) => setCallInput({ ...callInput, [key]: event.target.value })} /></label>)}
      <div className="flex gap-2"><button className="rounded-full bg-[#325347] px-4 py-2 text-white disabled:opacity-50" disabled={busy || !callInput.focus.trim()} onClick={() => void act({ action: "CREATE_CALL", callId, organizeWithAi: false, input: callInput })}>Save reviewed summary</button>
      <button className="rounded-full bg-[#c6ebda] px-4 py-2 disabled:opacity-50" disabled={busy || !callInput.focus.trim() || !consentCurrent} onClick={() => void act({ action: "CREATE_CALL", callId, organizeWithAi: true, input: callInput })}>Organize with AI</button></div>
    </div> : null}
    {error ? <p role="alert" className="mt-2 text-red-700">{error}</p> : null}
    <div className="mt-4 space-y-3">{notes.map((note) => <article key={note.id} className="rounded-xl border p-3">
      <p className="font-medium">{note.status === "AI_DRAFT" ? "AI Draft" : "Reviewed by therapist"} · {note.source.replaceAll("_", " ")} · {new Date(note.periodEnd).toLocaleDateString()}</p>
      {isTherapist && note.status === "AI_DRAFT" && editing === note.id ? <div className="mt-3 space-y-2">
        {fields.map(({ key, label }) => <label className="block" key={key}>{label}<textarea className="mt-1 block w-full rounded-xl border p-2" value={typeof form[key] === "string" ? form[key] : (form[key] as string[]).join("\n")}
          onChange={(event) => setForm({ ...form, [key]: key === "summary" ? event.target.value : event.target.value.split("\n").map((line) => line.trim()).filter(Boolean) })} /></label>)}
        <button className="rounded-full bg-[#325347] px-4 py-2 text-white disabled:opacity-50" disabled={busy} onClick={() => void act({ action: "REVIEW", noteId: note.id, content: form })}>Approve reviewed shared note</button>
      </div> : <><p className="mt-2 whitespace-pre-wrap">{note.content.summary}</p>
        {fields.slice(1).map(({ key, label }) => (note.content[key] as string[]).length ? <p className="mt-1" key={key}><strong>{label}:</strong> {(note.content[key] as string[]).join("; ")}</p> : null)}
        {isTherapist && note.status === "AI_DRAFT" ? <button className="mt-2 underline" onClick={() => { setEditing(note.id); setForm(note.content); }}>Review and edit</button> : null}</>}
    </article>)}</div>
  </section>;
}
