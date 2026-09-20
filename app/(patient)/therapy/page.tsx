"use client";

import { EmptyState } from "@/src/components/shared/EmptyState";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/src/components/ui/Button";
import { Input } from "@/src/components/forms/Input";
import { Spinner } from "@/src/components/ui/Spinner";
import { TherapistProfileCard } from "@/src/components/shared/TherapistProfileCard";
import { Modal } from "@/src/components/ui/Modal";
import { useAuth } from "@/src/context/AuthContext";
import { observePatientConnection, requestConnection, revokeConnection } from "@/src/services/connectionService";
import { listVerifiedTherapists } from "@/src/services/therapistService";
import { Connection, ConnectionStatus, TherapistProfile } from "@/src/types/database";
import { THERAPY_CONSENT_DISCLOSURE } from "@/src/lib/therapy/consent";

export default function TherapyPage() {
  const { user } = useAuth();
  const [therapists, setTherapists] = useState<TherapistProfile[]>([]);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [directoryError, setDirectoryError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyTherapistId, setBusyTherapistId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [consentTherapistId, setConsentTherapistId] = useState<string | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);

  useEffect(() => {
    let mounted = true;

    listVerifiedTherapists()
      .then((profiles) => {
        if (mounted) {
          setTherapists(profiles);
        }
      })
      .catch((error) => {
        console.error("Failed to load therapists:", error);
        setDirectoryError(true);
        setFeedback("Could not load verified therapists. Please refresh to try again.");
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      return;
    }

    return observePatientConnection(
      user.uid,
      setConnection,
      (error) => {
        console.error("Failed to observe patient connection:", error);
        setFeedback("Could not load your therapist connection.");
      }
    );
  }, [user?.uid]);

  async function handleRevoke() {
    if (!user) return;
    setBusyTherapistId(connection?.therapistId ?? null);
    try {
      if (!connection?.relationshipId) throw new Error("Connection details are unavailable.");
      await revokeConnection(connection.relationshipId);
      setFeedback(
        connection.status === ConnectionStatus.PENDING
          ? "Your connection request has been cancelled."
          : "Your connection has been ended."
      );
    } catch {
      setFeedback("Could not end this connection. Please try again.");
    } finally { setBusyTherapistId(null); }
  }

  async function handleRequest() {
    const therapistId = consentTherapistId;
    if (!user?.uid || !therapistId || !consentAccepted) {
      return;
    }

    setBusyTherapistId(therapistId);
    setFeedback(null);

    try {
      await requestConnection(therapistId);
      setFeedback("Request sent. You will see the status here.");
      setConsentTherapistId(null);
      setConsentAccepted(false);
    } catch (error) {
      console.error("Failed to request therapist:", error);
      setFeedback(error instanceof Error ? error.message : "Could not request this therapist.");
    } finally {
      setBusyTherapistId(null);
    }
  }

  const activeTherapist = therapists.find((therapist) => therapist.therapistId === connection?.therapistId);
  const hasBlockingConnection = connection?.status === ConnectionStatus.PENDING || connection?.status === ConnectionStatus.ACTIVE;
  const visibleTherapists = useMemo(() => {
    const normalizedTerm = searchTerm.trim().toLowerCase();
    if (!normalizedTerm) return therapists;
    return therapists.filter((therapist) => [therapist.name, therapist.specialty, therapist.licenseNo, therapist.bio].some((value) => value.toLowerCase().includes(normalizedTerm)));
  }, [searchTerm, therapists]);

  return (
    <div className="min-w-0">

      <div className="mx-auto max-w-7xl space-y-6 pb-10">
      <header className="flex flex-col justify-between gap-6 px-3 pt-3 lg:flex-row lg:items-end lg:px-1">
        <div className="max-w-2xl"><p className="text-xs font-medium uppercase tracking-[0.12em] text-[#4a6b5e]/70">Verified professionals</p><h1 className="mt-2 text-4xl font-medium tracking-[-0.04em] text-[#2c1601] sm:text-5xl">Find your match</h1><p className="mt-3 text-base font-light leading-7 text-[#414845]">Connect with verified professionals. Take your time browsing and choose one connection at a time.</p></div>
        <div className="w-full lg:max-w-sm"><Input aria-label="Search verified therapists" className="bg-white/85 pr-4" leftIcon={<span aria-hidden="true" className="material-symbols-outlined">search</span>} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search by name or specialty" value={searchTerm} /></div>
      </header>

      {connection && connection.status !== ConnectionStatus.REVOKED ? (
        <section className="rounded-[2rem] border border-white/75 bg-[#c6ebda]/70 p-5 shadow-[0_15px_30px_-20px_rgba(74,107,94,0.25),inset_0_2px_4px_rgba(255,255,255,0.65)] sm:p-6">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#2d4d41]/70">Current status · {connection.status.toLowerCase()}</p>
          <h2 className="mt-2 text-2xl font-medium text-[#2d4d41]">{activeTherapist?.name ?? "Selected therapist"}</h2>
          {connection.status === ConnectionStatus.ACTIVE ? (
            <div className="mt-4 flex flex-wrap gap-3">
              <Link className="rounded-full bg-[#325347] px-5 py-3 text-sm font-medium text-white shadow-[0_8px_16px_-6px_rgba(50,83,71,0.3)] transition hover:bg-[#4a6b5e]" href={`/therapy/chat/${connection.therapistId}`}>
                Message
              </Link>
              <Button isLoading={busyTherapistId === connection.therapistId} onClick={handleRevoke} variant="outline">
                End connection
              </Button>
            </div>
          ) : connection.status === ConnectionStatus.PENDING ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <p className="text-sm leading-6 text-[#2d4d41]">Your request is waiting for therapist review.</p>
              <Button isLoading={busyTherapistId === connection.therapistId} onClick={handleRevoke} variant="outline">
                Cancel request
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-sm leading-6 text-[#2d4d41]">This request was not accepted. You can choose another therapist.</p>
          )}
        </section>
      ) : null}

      {feedback ? <p className="rounded-[1.5rem] bg-white/80 px-5 py-4 text-sm text-[#414845] shadow-sm" role="status">{feedback}</p> : null}

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Spinner label="Loading therapists" />
        </div>
      ) : directoryError ? null : (
        <section className="grid gap-6 xl:grid-cols-2 2xl:grid-cols-3">
          {therapists.length === 0 ? (
            <div className="xl:col-span-2 2xl:col-span-3"><EmptyState icon="spa" title="More support is on its way" description="There aren’t any verified therapists listed yet. You can keep journaling or talk with Momo while you check back." href="/momo" action="Talk to Momo" /></div>
          ) : visibleTherapists.map((therapist) => {
            const isSelected = connection?.therapistId === therapist.therapistId;
            const specialties = therapist.specialty.split(",").map((item) => item.trim()).filter(Boolean);

            return (
              <TherapistProfileCard
                bio={therapist.bio || "A verified therapist available for secure one-to-one support."}
                ctaLabel={isSelected && hasBlockingConnection ? (connection?.status === ConnectionStatus.ACTIVE ? "Connected" : "Request pending") : hasBlockingConnection ? "End current connection first" : "Request connection"}
                disabled={hasBlockingConnection}
                isLoading={busyTherapistId === therapist.therapistId}
                key={therapist.therapistId}
                name={therapist.name}
                onConnect={() => {
                  setConsentAccepted(false);
                  setConsentTherapistId(therapist.therapistId);
                }}
                specialties={specialties.length ? specialties : ["General therapy"]}
                title={therapist.licenseNo || "Verified therapist"}
              />
            );
          })}
          {therapists.length > 0 && visibleTherapists.length === 0 ? <div className="rounded-[2rem] bg-white/75 p-7 text-sm text-[#414845] xl:col-span-2 2xl:col-span-3">No verified therapists match that search yet. Try another specialty or name.</div> : null}
        </section>
      )}
      <Modal description="Review what this therapist can access before sending your request." isOpen={Boolean(consentTherapistId)} onClose={() => { if (!busyTherapistId) setConsentTherapistId(null); }} title="Share with this therapist">
        <div className="space-y-5">
          <p className="rounded-[1.5rem] bg-[#fff1e8] p-5 text-sm font-light leading-6 text-[#414845]">{THERAPY_CONSENT_DISCLOSURE}</p>
          <p className="text-sm leading-6 text-[#4a6b5e]">Your email, emergency contact, journals, mood check-ins, and Momo conversations remain private.</p>
          <label className="flex cursor-pointer items-start gap-3 rounded-[1.5rem] border border-[#c6ebda] bg-[#eefaf5] p-4 text-sm text-[#325347]">
            <input checked={consentAccepted} className="mt-1 size-4 accent-[#325347]" onChange={(event) => setConsentAccepted(event.target.checked)} type="checkbox" />
            <span>I understand and consent to this sharing.</span>
          </label>
          <div className="flex justify-end gap-3">
            <Button disabled={Boolean(busyTherapistId)} onClick={() => setConsentTherapistId(null)} variant="outline">Cancel</Button>
            <Button disabled={!consentAccepted} isLoading={Boolean(busyTherapistId)} onClick={handleRequest}>Send request</Button>
          </div>
        </div>
      </Modal>
      </div>
    </div>
  );
}
