"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/src/components/ui/Button";
import { useAuth } from "@/src/context/AuthContext";

export default function SettingsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

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
      <section className="clay-card p-7"><h2 className="text-xl font-medium text-[#325347]">Download your data</h2><p className="mt-2 text-sm leading-6 text-[#414845]">Export your profile, journals, check-ins, Momo conversations, and therapy relationship records as JSON.</p><Button className="mt-5" isLoading={busy === "export"} onClick={exportData}>Download export</Button></section>
      <section className="rounded-[2rem] border border-[#ba1a1a]/20 bg-[#ffdad6]/55 p-7"><h2 className="text-xl font-medium text-[#93000a]">Delete account</h2><p className="mt-2 text-sm leading-6 text-[#64120f]">This permanently deletes your account data. End any active therapist connection first. Type DELETE to continue.</p><input aria-label="Type DELETE to confirm account deletion" className="mt-5 w-full rounded-full border border-[#ba1a1a]/25 bg-white/80 px-5 py-3" onChange={(event) => setConfirmation(event.target.value)} value={confirmation} /><Button className="mt-4" disabled={confirmation !== "DELETE"} isLoading={busy === "delete"} onClick={deleteAccount} variant="danger">Delete my account</Button></section>
    </div>
  );
}
