"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { ErrorMessage } from "@/src/components/forms/ErrorMessage";
import { Button } from "@/src/components/ui/Button";
import { Card } from "@/src/components/ui/Card";
import { db } from "@/src/config/firebase";
import { useAuth } from "@/src/context/AuthContext";
import { buildAnonymousUserProfile, buildRoleBridgeUserProfile } from "@/src/services/authService";
import { UserRole } from "@/src/types/database";
import { AUTH_ROUTES, getAuthRedirectPath, type RoutableUserDoc } from "@/src/utils/authRouter";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function SelectRolePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [isChecking, setIsChecking] = useState(true);
  const [selectedRole, setSelectedRole] = useState<UserRole.USER | UserRole.THERAPIST | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      router.replace(AUTH_ROUTES.login);
      return;
    }

    let isActive = true;

    const hydrateAuthState = async () => {
      try {
        const userDocSnap = await getDoc(doc(db, "users", user.uid));

        if (!isActive) {
          return;
        }

        if (userDocSnap.exists()) {
          router.replace(getAuthRedirectPath(user, userDocSnap.data() as RoutableUserDoc));
          return;
        }

        if (user.isAnonymous) {
          const guestProfile = buildAnonymousUserProfile(user);
          await setDoc(doc(db, "users", user.uid), guestProfile);

          if (!isActive) {
            return;
          }

          router.replace(getAuthRedirectPath(user, guestProfile));
          return;
        }

        setIsChecking(false);
      } catch (authStateError: unknown) {
        if (!isActive) {
          return;
        }

        setError(
          getErrorMessage(authStateError, "We couldn't verify your sign-in state. Please try again.")
        );
        setIsChecking(false);
      }
    };

    hydrateAuthState();

    return () => {
      isActive = false;
    };
  }, [authLoading, router, user]);

  const handleRoleSelection = async (role: UserRole.USER | UserRole.THERAPIST) => {
    if (!user) {
      router.replace(AUTH_ROUTES.login);
      return;
    }

    setSelectedRole(role);
    setError(null);

    try {
      const profile = buildRoleBridgeUserProfile(user, role);
      await setDoc(doc(db, "users", user.uid), profile);
      router.push(getAuthRedirectPath(user, profile));
    } catch (selectionError: unknown) {
      setError(
        getErrorMessage(selectionError, "We couldn't save your role yet. Please try again.")
      );
      setSelectedRole(null);
    }
  };

  if (authLoading || isChecking || !user) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#fff8f5] px-6 py-10 font-['Plus_Jakarta_Sans'] text-[#2c1601]">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute left-[-8%] top-[-10%] h-[24rem] w-[24rem] rounded-full bg-[#fed1b4]/70 blur-3xl sm:h-[32rem] sm:w-[32rem]" />
          <div className="absolute bottom-[-18%] right-[-10%] h-[26rem] w-[26rem] rounded-full bg-[#c6ebda]/60 blur-3xl sm:h-[34rem] sm:w-[34rem]" />
        </div>
        <Card variant="solid" className="w-full max-w-md p-8 text-center sm:p-10">
          <div className="mx-auto mb-5 h-12 w-12 animate-spin rounded-full border-4 border-[#abcebf] border-t-[#325347]" />
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#4a6b5e]">
            Checking your profile
          </p>
          <p className="mt-3 text-sm text-[#414845]">
            We&apos;re making sure you land in the right place without repeating onboarding.
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
                Identity Bridge
              </p>
              <h1 className="mt-4 text-4xl font-medium leading-[1.1] text-[#325347] sm:text-5xl">
                Tell us which side of care you&apos;re stepping into.
              </h1>
              <p className="mt-5 max-w-lg text-base font-light leading-7 text-[#414845] sm:text-lg">
                Your provider sign-in is ready. We just need your role once so we can create the
                right profile and send you to the correct onboarding flow.
              </p>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <Card variant="peach" className="rounded-[2rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#795841]">
                  One-time choice
                </p>
                <p className="mt-2 text-sm font-light leading-6 text-[#5e402b]">
                  We store your role once, then use it to keep future sign-ins on the right path.
                </p>
              </Card>
              <Card variant="sage" className="rounded-[2rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2d4d41]">
                  No repeat onboarding
                </p>
                <p className="mt-2 text-sm font-light leading-6 text-[#2d4d41]">
                  Completed users skip setup forever and go straight to dashboard or portal.
                </p>
              </Card>
              <Card variant="inset" className="rounded-[2rem] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#795841]">
                  Secure profile
                </p>
                <p className="mt-2 text-sm font-light leading-6 text-[#5e402b]">
                  Your database profile is created only after you confirm the right identity.
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
                  Choose your role
                </p>
                <h2 className="mt-3 text-3xl font-medium tracking-tight text-[#325347]">
                  Who are you joining as?
                </h2>
                <p className="mt-3 text-sm font-light leading-6 text-[#414845]">
                  Pick the experience you need. We&apos;ll create your `/users/{'{uid}'}` profile and
                  route you into the right onboarding path immediately.
                </p>
              </header>

              <div className="mt-8 space-y-6">
                <ErrorMessage>{error}</ErrorMessage>

                <button
                  type="button"
                  onClick={() => handleRoleSelection(UserRole.USER)}
                  disabled={selectedRole !== null}
                  className={`w-full rounded-[2.25rem] border p-6 text-left transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#abcebf] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fff8f5] ${
                    selectedRole === UserRole.USER
                      ? "border-[#4a6b5e] bg-[#c6ebda] text-[#002117] shadow-[0_25px_40px_-22px_rgba(74,107,94,0.45),inset_0_2px_4px_rgba(255,255,255,0.8)]"
                      : "border-white/70 bg-[#fff1e8] text-[#5e402b] shadow-[0_20px_40px_-25px_rgba(121,88,65,0.2),inset_0_1px_3px_rgba(255,255,255,0.8)] hover:bg-[#ffe3cd] disabled:cursor-not-allowed disabled:opacity-70"
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                    Patient Path
                  </p>
                  <p className="mt-3 text-3xl font-medium text-[#325347]">I am a Patient</p>
                  <p className="mt-3 max-w-md text-sm font-light leading-6 text-inherit">
                    Create a care-seeker profile and continue into patient onboarding.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleRoleSelection(UserRole.THERAPIST)}
                  disabled={selectedRole !== null}
                  className={`w-full rounded-[2.25rem] border p-6 text-left transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#abcebf] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fff8f5] ${
                    selectedRole === UserRole.THERAPIST
                      ? "border-[#4a6b5e] bg-[#325347] text-white shadow-[0_25px_40px_-20px_rgba(50,83,71,0.5),inset_0_2px_4px_rgba(255,255,255,0.22)]"
                      : "border-white/70 bg-[#fff1e8] text-[#5e402b] shadow-[0_20px_40px_-25px_rgba(121,88,65,0.2),inset_0_1px_3px_rgba(255,255,255,0.8)] hover:bg-[#ffe3cd] disabled:cursor-not-allowed disabled:opacity-70"
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                    Practitioner Path
                  </p>
                  <p className="mt-3 text-3xl font-medium">I am a Practitioner</p>
                  <p className="mt-3 max-w-md text-sm font-light leading-6 text-inherit">
                    Create a clinician profile and continue into practitioner onboarding.
                  </p>
                </button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full rounded-[2rem] border border-dashed border-[#ffe3cd] bg-white/50 py-4 text-[#795841] hover:bg-[#fff1e8]"
                  onClick={() => router.push(AUTH_ROUTES.login)}
                  disabled={selectedRole !== null}
                >
                  Back to Login
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
