"use client";

import { useCallback, useEffect, useState } from "react";
import { auth } from "@/src/config/firebase";

type Weekly = { therapy: { sessions: string[]; topicsDiscussed: string[]; userReportedConcerns: string[]; strategiesDiscussed: string[]; goalsAgreed: string[]; followUpItems: string[] } | null;
  reflection: { observations: string[]; supportiveReflection: string; suggestedNextSteps: string[] } | null };
function mondayUtc() {
  const now = new Date();
  const day = now.getUTCDay();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((day + 6) % 7))).toISOString();
}
function weekForDate(value: string) {
  const selected = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(selected.getTime())) return mondayUtc();
  selected.setUTCDate(selected.getUTCDate() - ((selected.getUTCDay() + 6) % 7));
  return selected.toISOString();
}
export function TherapyWeeklyPanel({ relationshipId, isTherapist }: { relationshipId: string; isTherapist: boolean }) {
  const [data, setData] = useState<Weekly | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [weekStart, setWeekStart] = useState(mondayUtc);
  const request = useCallback(async (generate: boolean) => {
    const user = auth.currentUser;
    if (!user) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(generate ? "/api/therapy/weekly" : `/api/therapy/weekly?relationshipId=${encodeURIComponent(relationshipId)}&weekStart=${encodeURIComponent(weekStart)}`, {
        method: generate ? "POST" : "GET", cache: "no-store",
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" },
        ...(generate ? { body: JSON.stringify({ relationshipId, weekStart }) } : {}),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Weekly report unavailable");
      setData(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Weekly report unavailable"); }
    finally { setBusy(false); }
  }, [relationshipId, weekStart]);
  useEffect(() => { queueMicrotask(() => void request(false)); }, [request]);
  return <section className="rounded-2xl border border-[#c6ebda] bg-white/85 p-4 text-sm text-[#325347]">
    <h2 className="font-semibold">Weekly therapy summary and reflection</h2>
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <label>Week of <input className="rounded-lg border p-1" type="date" value={weekStart.slice(0, 10)} onChange={(event) => setWeekStart(weekForDate(event.target.value))} /></label>
      {!isTherapist ? <button className="rounded-full bg-[#325347] px-4 py-2 text-white disabled:opacity-50" disabled={busy} onClick={() => void request(true)}>Generate weekly reports</button> : null}
    </div>
    {error ? <p role="alert" className="mt-2 text-red-700">{error}</p> : null}
    {data?.therapy ? <div className="mt-3"><h3 className="font-medium">Weekly Therapy Summary</h3>
      {Object.entries(data.therapy).map(([key, values]) => values.length ? <p className="mt-1" key={key}><strong>{key.replaceAll(/([A-Z])/g, " $1")}:</strong> {values.join("; ")}</p> : null)}
    </div> : <p className="mt-2">No weekly therapy summary for this week.</p>}
    {!isTherapist && data?.reflection ? <div className="mt-3"><h3 className="font-medium">Your Week</h3><p>{data.reflection.supportiveReflection}</p>
      {data.reflection.observations.map((item, index) => <p className="mt-1" key={index}>• {item}</p>)}
      {data.reflection.suggestedNextSteps.map((item, index) => <p className="mt-1" key={index}>Something to reflect on: {item}</p>)}
    </div> : null}
  </section>;
}
