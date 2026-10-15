"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { Button } from "@/src/components/ui/Button";
import { useAuth } from "@/src/context/AuthContext";
import { db } from "@/src/config/firebase";
import {
  DEFAULT_MOMO_PRIVACY_PREFERENCES,
  parseMomoPrivacyPreferences,
  type MomoPrivacyPreferences,
} from "@/src/lib/momo/privacy";

export default function SettingsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<MomoPrivacyPreferences>(DEFAULT_MOMO_PRIVACY_PREFERENCES);
  const [privacyBusy, setPrivacyBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void getDoc(doc(db, "users", user.uid)).then((snapshot) => {
      if (active) setPreferences(parseMomoPrivacyPreferences(snapshot.data()?.momoPrivacyPreferences));
    }).catch(() => {
      if (active) setFeedback("Could not load Momo privacy preferences.");
    });
    return () => { active = false; };
  }, [user]);

  async function setMomoPreference(key: keyof MomoPrivacyPreferences, enabled: boolean) {
    if (!user) return;
    const previous = preferences;
    const next = { ...preferences, [key]: enabled };
    setPreferences(next);
    setPrivacyBusy(true);
    setFeedback(null);
    try {
      await updateDoc(doc(db, "users", user.uid), { momoPrivacyPreferences: next });
      setFeedback("Momo privacy preferences saved.");
    } catch {
      setPreferences(previous);
      setFeedback("Could not save Momo privacy preferences.");
    } finally {
      setPrivacyBusy(false);
    }
  }

  async function authorizedFetch(method: "GET" | "DELETE") {
    if (!user) throw new Error("Sign in is required.");
    return fetch("/api/account", { method, headers: { Authorization: `Bearer ${await user.getIdToken(true)}` } });
  }
  async function exportData() {
    setBusy("export");
    setFeedback(null);
    try {
      const response = await authorizedFetch("GET");
      if (!response.ok) throw new Error((await response.json()).error ?? "Export failed.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "rant-and-heal-data.json";
      anchor.click();
      URL.revokeObjectURL(url);
      setFeedback("Your export has downloaded.");
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : "Export failed.");
    } finally { setBusy(null); }
  }
  async function deleteAccount() {
    if (confirmation !== "DELETE") return;
    setBusy("delete");
    setFeedback(null);
    try {
      const response = await authorizedFetch("DELETE");
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Account deletion failed.");
      router.replace("/");
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : "Account deletion failed.");
      setBusy(null);
    }
  }
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="rounded-[2.5rem] border border-white/80 bg-[#c6ebda]/70 p-8"><p className="text-xs uppercase tracking-[.12em] text-[#4a6b5e]">Privacy controls</p><h1 className="mt-2 text-4xl font-medium text-[#325347]">Your data</h1></header>
      {feedback ? <p className="rounded-2xl bg-white/80 p-4 text-sm" role="status">{feedback}</p> : null}
      <section className="clay-card p-7">
        <h2 className="text-xl font-medium text-[#325347]">Momo insights</h2>
        <p className="mt-2 text-sm leading-6 text-[#414845]">Your full conversations are stored with application-level encryption. These optional controls apply only to small structured insight records inferred from conversations.</p>
        <div className="mt-6 grid gap-5">
          <label className="flex items-start justify-between gap-5 rounded-2xl bg-[#fff1e8] p-5">
            <span><span className="block font-medium text-[#325347]">Mood trend insights</span><span className="mt-1 block text-sm leading-6 text-[#596c60]">Allows Rant &amp; Heal to retain structured mood-related trends from conversations for your personal analytics.</span></span>
            <input aria-label="Mood trend insights" checked={preferences.moodTrendAnalyticsEnabled} disabled={privacyBusy} onChange={(event) => void setMomoPreference("moodTrendAnalyticsEnabled", event.target.checked)} type="checkbox" className="mt-1 size-5 accent-[#325347]" />
          </label>
          <label className="flex items-start justify-between gap-5 rounded-2xl bg-[#fff1e8] p-5">
            <span><span className="block font-medium text-[#325347]">Success/outcome insights</span><span className="mt-1 block text-sm leading-6 text-[#596c60]">Allows Rant &amp; Heal to retain structured information about which support approaches you report as helpful or unhelpful.</span></span>
            <input aria-label="Success/outcome insights" checked={preferences.outcomeAnalyticsEnabled} disabled={privacyBusy} onChange={(event) => void setMomoPreference("outcomeAnalyticsEnabled", event.target.checked)} type="checkbox" className="mt-1 size-5 accent-[#325347]" />
          </label>
          <div className="rounded-2xl border border-[#abcebf] bg-[#c6ebda]/35 p-5"><p className="font-medium text-[#325347]">Safety processing</p><p className="mt-1 text-sm leading-6 text-[#596c60]">Always active while using Momo so the service can respond to serious safety concerns.</p></div>
        </div>
      </section>
      <section className="clay-card p-7"><h2 className="text-xl font-medium text-[#325347]">Download your data</h2><p className="mt-2 text-sm leading-6 text-[#414845]">Export your profile, coarse journal activity, check-ins, encrypted Momo conversation records, and therapy relationship records as JSON. This server-side export does not decrypt your Momo history or read Vault documents.</p><Button className="mt-5" isLoading={busy === "export"} onClick={exportData}>Download export</Button></section>
      <section className="rounded-[2rem] border border-[#ba1a1a]/20 bg-[#ffdad6]/55 p-7"><h2 className="text-xl font-medium text-[#93000a]">Delete account</h2><p className="mt-2 text-sm leading-6 text-[#64120f]">This permanently deletes your account data. End any active therapist connection first. Type DELETE to continue.</p><input aria-label="Type DELETE to confirm account deletion" className="mt-5 w-full rounded-full border border-[#ba1a1a]/25 bg-white/80 px-5 py-3" onChange={(event) => setConfirmation(event.target.value)} value={confirmation} /><Button className="mt-4" disabled={confirmation !== "DELETE"} isLoading={busy === "delete"} onClick={deleteAccount} variant="danger">Delete my account</Button></section>
    </div>
  );
}
