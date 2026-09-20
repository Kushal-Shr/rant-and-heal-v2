"use client";

import { MomoPortrait } from "@/src/components/shared/MomoPortrait";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  authService,
  buildAnonymousUserProfile,
  buildRoleBridgeUserProfile,
  type UniversalAuthResult,
} from "@/src/services/authService";
import { db } from "@/src/config/firebase";
import { Button } from "@/src/components/ui/Button";
import { Card } from "@/src/components/ui/Card";
import { Input } from "@/src/components/forms/Input";
import { Label } from "@/src/components/forms/Label";
import { ErrorMessage } from "@/src/components/forms/ErrorMessage";
import { UserRole } from "@/src/types/database";
import { doc, setDoc } from "firebase/firestore";
import { getAuthRedirectPath, type RoutableUserDoc } from "@/src/utils/authRouter";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const role = UserRole.USER;
  const [activeAction, setActiveAction] = useState<
    "email" | "google" | "apple" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loading = activeAction !== null;

  const handleUniversalAuthSuccess = async (result: UniversalAuthResult) => {
    if (result.status === "NEW_USER") {
      if (result.user.isAnonymous) {
        const guestProfile = buildAnonymousUserProfile(result.user);
        await setDoc(doc(db, "users", result.uid), guestProfile);
        router.push(getAuthRedirectPath(result.user, guestProfile));
        return;
      }

      // Initialize the database document immediately for social registration
      const patientProfile = buildRoleBridgeUserProfile(result.user);
      await setDoc(doc(db, "users", result.uid), patientProfile);
      router.push(getAuthRedirectPath(result.user, patientProfile));
      return;
    }

    router.push(
      getAuthRedirectPath(result.user, result.userDoc as RoutableUserDoc)
    );
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name || !email || !password) {
      setError("Please fill out all fields.");
      return;
    }

    setActiveAction("email");
    setError(null);

    try {
      await authService.signUpWithEmail(email, password, name, role);
      setSuccessMessage("Account created successfully! Please check your email inbox to verify your account before logging in.");
    } catch (error: unknown) {
      setError(getErrorMessage(error, "Registration failed. Please try again."));
    } finally {
      setActiveAction(null);
    }
  };

  const handleProviderAuth = async (provider: "google" | "apple") => {
    setActiveAction(provider);
    setError(null);

    try {
      const result =
        provider === "google"
          ? await authService.signInWithGoogle()
          : await authService.signInWithApple();

      await handleUniversalAuthSuccess(result);
    } catch (error: unknown) {
      setError(getErrorMessage(error, "Authentication failed. Please try again."));
    } finally {
      setActiveAction(null);
    }
  };

  return (
    <div className="relative flex min-h-[calc(100dvh-5rem)] md:min-h-dvh items-center overflow-hidden px-5 py-10 font-['Plus_Jakarta_Sans'] text-[#2c1601] sm:px-8 xl:px-10">
      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 xl:grid-cols-[1fr_1fr]">
        <section className="order-2 max-w-xl xl:order-1">
          <Link className="inline-flex items-center gap-2 text-2xl font-semibold tracking-[-0.03em] text-[#325347]" href="/"><span aria-hidden="true" className="material-symbols-outlined">spa</span>Rant &amp; Heal</Link>
          <MomoPortrait animated className="mt-10 size-48 sm:size-60" />
          <h1 className="mt-10 text-4xl font-medium tracking-[-0.05em] text-[#793b26] sm:text-6xl">Start your journey.</h1>
          <p className="mt-5 max-w-lg text-lg font-light leading-8 text-[#795841]">Create a space for your thoughts with Momo. We&apos;re here to listen, not to judge.</p>
          <div className="mt-8 flex flex-wrap gap-3 text-sm"><span className="rounded-full bg-[#ffdcc6] px-4 py-2 text-[#795841]"><span aria-hidden="true" className="material-symbols-outlined mr-1 align-[-3px] text-base">lock</span>Private journal</span><span className="rounded-full bg-[#c6ebda] px-4 py-2 text-[#2d4d41]"><span aria-hidden="true" className="material-symbols-outlined mr-1 align-[-3px] text-base">smart_toy</span>AI companion</span><span className="rounded-full bg-[#ffe3cd] px-4 py-2 text-[#793b26]"><span aria-hidden="true" className="material-symbols-outlined mr-1 align-[-3px] text-base">diversity_1</span>Find support</span></div>
        </section>

      <Card variant="solid" className="order-1 w-full p-7 sm:p-10 xl:order-2">
        <header className="mb-7">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#4a6b5e]/70">Create your account</p>
          <h2 className="mt-2 text-3xl font-medium tracking-[-0.03em] text-[#325347]">Welcome in</h2>
          <p className="mt-2 text-sm leading-6 text-[#414845]">Use an email or a supported sign-in provider.</p>
        </header>

        <div className="space-y-3">
          <Button
            type="button"
            variant="secondary"
            className="w-full justify-between px-5 py-4 text-left"
            onClick={() => handleProviderAuth("google")}
            isLoading={activeAction === "google"}
            disabled={loading}
          >
            <span>Continue with Google</span>
            <span aria-hidden="true" className="text-lg font-bold">
              G
            </span>
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full justify-between px-5 py-4 text-left"
            onClick={() => handleProviderAuth("apple")}
            isLoading={activeAction === "apple"}
            disabled={loading}
          >
            <span>Continue with Apple</span>
            <span aria-hidden="true" className="text-lg font-bold">
              A
            </span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full justify-between rounded-[2rem] border border-[#ffe3cd] bg-[#fff1e8] px-5 py-4 text-left text-[#795841] hover:bg-[#ffe3cd]"
            disabled
          >
            <span>Continue with Phone</span>
            <span className="text-[11px] font-semibold tracking-[0.18em] text-[#717974]">
              Soon
            </span>
          </Button>
        </div>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-[#ffe3cd]" />
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-[#717974]">
            Or create with email
          </span>
          <div className="h-px flex-1 bg-[#ffe3cd]" />
        </div>

        {successMessage ? (
          <div className="rounded-lg bg-[#e8f5e9] p-4 text-center text-[#2e7d32]">
            <h3 className="font-bold text-lg mb-2">Check Your Email</h3>
            <p>{successMessage}</p>
            <Button variant="outline" className="mt-6 w-full" onClick={() => router.push("/auth/login")}>
              Go to Log In
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && <ErrorMessage>{error}</ErrorMessage>}

            <div className="space-y-2">
            <Label htmlFor="fullname">Full Name</Label>
            <Input
              id="fullname"
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              disabled={loading}
              required
            />
          </div>

            <Button type="submit" variant="primary" className="mt-2 w-full py-4" isLoading={loading}>
              Create account <span aria-hidden="true" className="material-symbols-outlined text-lg">arrow_forward</span>
            </Button>
          </form>
        )}

        <footer className="mt-8 text-center text-sm text-[#414845]">
          Already have an account?{" "}
          <Link href="/auth/login" className="font-semibold text-[#325347] hover:underline">
            Log In
          </Link>
        </footer>
      </Card>
      </div>
    </div>
  );
}
