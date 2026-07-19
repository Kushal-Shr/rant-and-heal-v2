"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/src/components/ui/Button";
import { Spinner } from "@/src/components/ui/Spinner";
import { useAuth } from "@/src/context/AuthContext";
import { observePatientConnection, requestConnection, revokeConnection } from "@/src/services/connectionService";
import { listVerifiedTherapists } from "@/src/services/therapistService";
import { Connection, ConnectionStatus, TherapistProfile } from "@/src/types/database";

function consentHashFor(patientUid: string, therapistUid: string) {
  return `mvp-consent:${patientUid}:${therapistUid}`;
}

export default function TherapyPage() {
  const { user } = useAuth();
  const [therapists, setTherapists] = useState<TherapistProfile[]>([]);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyTherapistId, setBusyTherapistId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

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
        setFeedback("Could not load verified therapists.");
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

  async function handleRequest(therapistId: string) {
    if (!user?.uid) {
      return;
    }

    setBusyTherapistId(therapistId);
    setFeedback(null);

    try {
      await requestConnection(user.uid, therapistId, consentHashFor(user.uid, therapistId));
      setFeedback("Request sent. You will see the status here.");
    } catch (error) {
      console.error("Failed to request therapist:", error);
      setFeedback(error instanceof Error ? error.message : "Could not request this therapist.");
    } finally {
      setBusyTherapistId(null);
    }
  }

  const activeTherapist = therapists.find((therapist) => therapist.therapistId === connection?.therapistId);
  const hasBlockingConnection = connection?.status === ConnectionStatus.PENDING || connection?.status === ConnectionStatus.ACTIVE;

  return (
    <div className="space-y-6 font-['Plus_Jakarta_Sans'] text-[#2c1601]">
      <header className="border-2 border-[#2c1601] bg-[#fff8f5] p-6 shadow-[8px_8px_0_#abcebf]">
        <p className="text-sm font-bold uppercase text-[#4a6b5e]">Verified therapy</p>
        <h1 className="mt-2 text-3xl font-black">Choose one therapist connection</h1>
      </header>

      {connection && connection.status !== ConnectionStatus.REVOKED ? (
        <section className="border-2 border-[#2c1601] bg-[#ffd86b] p-5 shadow-[8px_8px_0_#2c1601]">
          <p className="text-sm font-black uppercase">Current status: {connection.status}</p>
          <h2 className="mt-2 text-xl font-black">{activeTherapist?.name ?? "Selected therapist"}</h2>
          {connection.status === ConnectionStatus.ACTIVE ? (
            <div className="mt-4 flex flex-wrap gap-3">
              <Link className="border-2 border-[#2c1601] bg-white px-5 py-3 font-black shadow-[4px_4px_0_#2c1601]" href={`/therapy/chat/${connection.therapistId}`}>
                Message
              </Link>
              <Button className="rounded-none border-2 border-[#2c1601] shadow-[4px_4px_0_#2c1601]" onClick={() => user?.uid && revokeConnection(user.uid)} variant="outline">
                Revoke
              </Button>
            </div>
          ) : connection.status === ConnectionStatus.PENDING ? (
            <p className="mt-3 font-bold">Your request is waiting for therapist review.</p>
          ) : (
            <p className="mt-3 font-bold">This request was not accepted. You can choose another therapist.</p>
          )}
        </section>
      ) : null}

      {feedback ? <p className="border-2 border-[#2c1601] bg-white p-4 font-bold">{feedback}</p> : null}

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Spinner label="Loading therapists" />
        </div>
      ) : (
        <section className="grid gap-5 md:grid-cols-2">
          {therapists.length === 0 ? (
            <div className="border-2 border-[#2c1601] bg-white p-6 shadow-[8px_8px_0_#e1d4ff] md:col-span-2">
              <p className="text-sm font-black uppercase text-[#4a6b5e]">No verified therapists yet</p>
              <h2 className="mt-2 text-2xl font-black">The directory is waiting for practitioner profiles.</h2>
              <p className="mt-3 max-w-2xl text-sm font-bold leading-6 text-[#414845]">
                Sign in as a practitioner and complete therapist onboarding to publish a verified MVP profile here.
              </p>
              <Link
                className="mt-5 inline-flex border-2 border-[#2c1601] bg-[#ffd86b] px-5 py-3 font-black shadow-[4px_4px_0_#2c1601]"
                href="/auth/provider/signup"
              >
                Create practitioner profile
              </Link>
            </div>
          ) : therapists.map((therapist) => {
            const isSelected = connection?.therapistId === therapist.therapistId;
            const specialties = therapist.specialty.split(",").map((item) => item.trim()).filter(Boolean);

            return (
              <article className="border-2 border-[#2c1601] bg-white p-5 shadow-[8px_8px_0_#abcebf]" key={therapist.therapistId}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-black">{therapist.name}</h2>
                    <p className="mt-1 text-sm font-bold text-[#4a6b5e]">{therapist.licenseNo}</p>
                  </div>
                  <span className="border-2 border-[#2c1601] bg-[#abcebf] px-3 py-1 text-xs font-black">Verified</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(specialties.length ? specialties : ["General therapy"]).map((specialty) => (
                    <span className="border-2 border-[#2c1601] bg-[#e1d4ff] px-3 py-1 text-xs font-black" key={specialty}>
                      {specialty}
                    </span>
                  ))}
                </div>
                <p className="mt-4 min-h-20 text-sm leading-6">{therapist.bio || "A verified therapist available for secure one-to-one support."}</p>
                <Button
                  className="mt-5 w-full rounded-none border-2 border-[#2c1601] shadow-[4px_4px_0_#2c1601]"
                  disabled={hasBlockingConnection && !isSelected}
                  isLoading={busyTherapistId === therapist.therapistId}
                  onClick={() => handleRequest(therapist.therapistId)}
                  variant={isSelected ? "secondary" : "primary"}
                >
                  {isSelected ? connection?.status ?? "Selected" : hasBlockingConnection ? "Unavailable" : "Request connection"}
                </Button>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
