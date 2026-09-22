"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/src/components/ui/Button";
import { Spinner } from "@/src/components/ui/Spinner";
import { useAuth } from "@/src/context/AuthContext";
import type { TherapistProfile } from "@/src/types/database";

export default function TherapistReviewPage() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<TherapistProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    const token = await user.getIdTokenResult(true);
    if (token.claims.admin !== true) {
      throw new Error("This account does not have administrator access. Ask the project owner to grant the Firebase admin claim.");
    }
    const response = await fetch("/api/admin/therapists", { headers: { Authorization: `Bearer ${token.token}` } });
    const payload = await response.json() as { therapists?: TherapistProfile[]; error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Could not load applications.");
    setItems(payload.therapists ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!authLoading && user) queueMicrotask(() => {
      void load().catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Could not load applications.");
        setLoading(false);
      });
    });
  }, [authLoading, load, user]);

  async function review(item: TherapistProfile, action: "VERIFY" | "REJECT") {
    if (!user) return;
    let rejectionReason: string | undefined;
    if (action === "REJECT") {
      rejectionReason = window.prompt("Give the applicant a concise reason for rejection:")?.trim();
      if (!rejectionReason) return;
    }
    setBusy(item.therapistId);
    setError(null);
    try {
      const response = await fetch(`/api/admin/therapists/${item.therapistId}/verification`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action, rejectionReason }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Review failed.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Review failed.");
    } finally {
      setBusy(null);
    }
  }

  if (authLoading || (user && loading)) return <div className="flex min-h-[60vh] items-center justify-center"><Spinner label="Loading therapist applications" /></div>;
  if (!user) return <p role="alert" className="clay-card p-7">Sign in with an administrator account to review applications.</p>;
  return (
    <div className="workspace space-y-6 text-[#2c1601]">
      <header className="rounded-[2.5rem] border border-white/80 bg-[#c6ebda]/70 p-8 shadow-[0_20px_40px_-20px_rgba(74,107,94,.22)]">
        <p className="text-xs font-medium uppercase tracking-[.12em] text-[#4a6b5e]">Admin review</p>
        <h1 className="mt-2 text-4xl font-medium text-[#325347]">Therapist applications</h1>
      </header>
      {error ? <p role="alert" className="rounded-2xl bg-[#ffdad6] p-4 text-[#93000a]">{error}</p> : null}
      {items.length === 0 ? <p className="clay-card p-7">There are no pending applications.</p> : items.map((item) => (
        <article className="clay-card p-7" key={item.therapistId}>
          <h2 className="text-xl font-medium text-[#325347]">{item.name}</h2>
          <p className="mt-1 text-sm text-[#4a6b5e]">{item.specialty} · License {item.licenseNo}</p>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[#414845]">{item.bio}</p>
          <div className="mt-5 flex gap-3">
            <Button isLoading={busy === item.therapistId} onClick={() => review(item, "VERIFY")}>Verify</Button>
            <Button disabled={busy !== null} onClick={() => review(item, "REJECT")} variant="danger">Reject</Button>
          </div>
        </article>
      ))}
    </div>
  );
}
