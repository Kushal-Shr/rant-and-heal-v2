"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, updateDoc } from "firebase/firestore";
import { ErrorMessage } from "@/src/components/forms/ErrorMessage";
import { Input } from "@/src/components/forms/Input";
import { Label } from "@/src/components/forms/Label";
import { Button } from "@/src/components/ui/Button";
import { Card } from "@/src/components/ui/Card";
import { db } from "@/src/config/firebase";
import { useAuth } from "@/src/context/AuthContext";

function generateAnonymousHandle() {
  return `Patient-${Math.floor(1000 + Math.random() * 9000)}`;
}

export default function PatientOnboardingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const previousDisplayNameRef = useRef("");
  const [displayName, setDisplayName] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [isIncognito, setIsIncognito] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/auth/login");
    }
  }, [authLoading, router, user]);

  const handleModeChange = (nextIsIncognito: boolean) => {
    setError(null);

    if (nextIsIncognito) {
      previousDisplayNameRef.current = displayName;
      setDisplayName((currentDisplayName) =>
        currentDisplayName.startsWith("Patient-") && currentDisplayName.trim()
          ? currentDisplayName
          : generateAnonymousHandle()
      );
    } else if (displayName.startsWith("Patient-")) {
      setDisplayName(previousDisplayNameRef.current);
    }

    setIsIncognito(nextIsIncognito);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!user?.uid) {
      router.replace("/auth/login");
      return;
    }

    if (!emergencyContact.trim()) {
      setError("Please add an emergency contact before continuing.");
      return;
    }

    const finalDisplayName = isIncognito
      ? displayName.trim() || generateAnonymousHandle()
      : displayName.trim();

    if (!finalDisplayName) {
      setError("Please choose how you'd like your display name to appear.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await updateDoc(doc(db, "users", user.uid), {
        displayName: finalDisplayName,
        emergencyContact: emergencyContact.trim(),
        isIncognito,
        onboardingComplete: true,
      });

      router.push("/dashboard");
    } catch (submitError: unknown) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "We couldn't save your onboarding details. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || !user) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#fff8f5] px-6 py-10 font-['Plus_Jakarta_Sans'] text-[#2c1601]">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute left-[-10%] top-[-12%] h-[28rem] w-[28rem] rounded-full bg-[#fed1b4]/60 blur-3xl" />
          <div className="absolute bottom-[-18%] right-[-8%] h-[30rem] w-[30rem] rounded-full bg-[#c6ebda]/50 blur-3xl" />
        </div>
        <Card variant="solid" className="w-full max-w-md p-8 text-center sm:p-10">
          <div className="mx-auto mb-5 h-12 w-12 animate-spin rounded-full border-4 border-[#abcebf] border-t-[#325347]" />
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#4a6b5e]">
            Preparing your safe space
          </p>
          <p className="mt-3 text-sm text-[#414845]">
            We&apos;re checking your session and setting up your onboarding.
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#fff8f5] px-6 py-10 font-['Plus_Jakarta_Sans'] text-[#2c1601] sm:px-8 lg:px-12">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-[-8%] top-[-10%] h-[24rem] w-[24rem] rounded-full bg-[#fed1b4]/70 blur-3xl sm:h-[32rem] sm:w-[32rem]" />
        <div className="absolute bottom-[-18%] right-[-10%] h-[26rem] w-[26rem] rounded-full bg-[#c6ebda]/60 blur-3xl sm:h-[34rem] sm:w-[34rem]" />
        <div className="absolute right-[12%] top-[42%] h-[16rem] w-[16rem] rounded-full bg-[#ffe3cd]/70 blur-3xl" />
      </div>

      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center">
        <div className="grid w-full gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
          <section className="flex flex-col justify-center">
            <Link href="/" className="mb-6 inline-flex items-center gap-3 self-start">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#c6ebda] text-lg font-black text-[#325347] shadow-[0_12px_30px_-12px_rgba(50,83,71,0.35)]">
                R
              </span>
              <span className="text-xl font-extrabold italic text-[#4a6b5e]">Rant & Heal</span>
            </Link>

            <div className="max-w-xl">
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#795841]">
                Patient Onboarding
              </p>
              <h1 className="mt-4 text-4xl font-medium leading-[1.1] text-[#325347] sm:text-5xl">
                Choose the identity that feels safest for your healing.
              </h1>
              <p className="mt-5 max-w-lg text-base font-light leading-7 text-[#414845] sm:text-lg">
                Standard mode uses your chosen name in care experiences. Incognito mode hides your
                identity from human therapists and assigns you a pseudonymous patient handle.
              </p>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <Card variant="peach" className="rounded-[2rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#795841]">
                  Gentle setup
                </p>
                <p className="mt-2 text-sm font-light leading-6 text-[#5e402b]">
                  A short profile that helps us personalize care without overloading you.
                </p>
              </Card>
              <Card variant="sage" className="rounded-[2rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2d4d41]">
                  Privacy first
                </p>
                <p className="mt-2 text-sm font-light leading-6 text-[#2d4d41]">
                  Your identity mode travels with your account preferences from day one.
                </p>
              </Card>
              <Card variant="inset" className="rounded-[2rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#795841]">
                  Fast finish
                </p>
                <p className="mt-2 text-sm font-light leading-6 text-[#5e402b]">
                  Save this step once and head straight into your patient dashboard.
                </p>
              </Card>
            </div>
          </section>

          <Card
            variant="solid"
            className="relative overflow-hidden p-6 shadow-[0_30px_70px_-30px_rgba(74,107,94,0.25),0_25px_40px_-25px_rgba(121,88,65,0.2)] sm:p-8"
          >
            <div className="absolute right-0 top-0 h-28 w-28 translate-x-8 -translate-y-8 rounded-full bg-[#ffe3cd]/80 blur-2xl" />
            <div className="relative">
              <header>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#795841]">
                  Step 1 of 1
                </p>
                <h2 className="mt-3 text-3xl font-medium tracking-tight text-[#325347]">
                  Set up your patient profile
                </h2>
                <p className="mt-3 text-sm font-light leading-6 text-[#414845]">
                  Tell us how you want to appear and who we should have on file as an emergency
                  contact.
                </p>
              </header>

              <form onSubmit={handleSubmit} className="mt-8 space-y-6">
                <ErrorMessage>{error}</ErrorMessage>

                <div className="space-y-3">
                  <Label>Choose your privacy mode</Label>
                  <div className="grid gap-4 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => handleModeChange(false)}
                      className={`rounded-[2rem] border p-6 text-left transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#abcebf] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fff8f5] ${
                        !isIncognito
                          ? "border-[#4a6b5e] bg-[#c6ebda] text-[#002117] shadow-[0_25px_40px_-22px_rgba(74,107,94,0.45),inset_0_2px_4px_rgba(255,255,255,0.8)]"
                          : "border-white/70 bg-[#fff1e8] text-[#5e402b] shadow-[0_20px_40px_-25px_rgba(121,88,65,0.2),inset_0_1px_3px_rgba(255,255,255,0.8)] hover:bg-[#ffe3cd]"
                      }`}
                      aria-pressed={!isIncognito}
                      disabled={isSubmitting}
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                        Standard Mode
                      </p>
                      <p className="mt-3 text-2xl font-medium">Public profile</p>
                      <p className="mt-3 text-sm font-light leading-6">
                        Your chosen name is visible in therapist-facing experiences.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleModeChange(true)}
                      className={`rounded-[2rem] border p-6 text-left transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#abcebf] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fff8f5] ${
                        isIncognito
                          ? "border-[#4a6b5e] bg-[#325347] text-white shadow-[0_25px_40px_-20px_rgba(50,83,71,0.5),inset_0_2px_4px_rgba(255,255,255,0.22)]"
                          : "border-white/70 bg-[#fff1e8] text-[#5e402b] shadow-[0_20px_40px_-25px_rgba(121,88,65,0.2),inset_0_1px_3px_rgba(255,255,255,0.8)] hover:bg-[#ffe3cd]"
                      }`}
                      aria-pressed={isIncognito}
                      disabled={isSubmitting}
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                        Incognito Mode
                      </p>
                      <p className="mt-3 text-2xl font-medium">Pseudonymous profile</p>
                      <p className="mt-3 text-sm font-light leading-6 text-inherit">
                        Therapists see an anonymous handle instead of your real identity.
                      </p>
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="displayName" required>
                    {isIncognito ? "Anonymous handle" : "Display name"}
                  </Label>
                  <Input
                    id="displayName"
                    type="text"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder={isIncognito ? "Patient-2048" : "What should your care team call you?"}
                    disabled={isSubmitting || isIncognito}
                    required
                  />
                  <p className="ml-2 text-xs font-medium leading-5 text-[#717974]">
                    {isIncognito
                      ? "Incognito mode automatically assigns your patient handle."
                      : "Use the name you want to appear across your care experience."}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="emergencyContact" required>
                    Emergency contact
                  </Label>
                  <Input
                    id="emergencyContact"
                    type="text"
                    value={emergencyContact}
                    onChange={(event) => setEmergencyContact(event.target.value)}
                    placeholder="Name and phone number"
                    disabled={isSubmitting}
                    required
                  />
                  <p className="ml-2 text-xs font-medium leading-5 text-[#717974]">
                    Add a trusted contact we can keep on file for urgent situations.
                  </p>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  isLoading={isSubmitting}
                  className="mt-2 w-full uppercase tracking-[0.16em]"
                >
                  Complete Onboarding
                </Button>
              </form>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
