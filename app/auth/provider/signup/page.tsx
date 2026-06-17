"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  authService,
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

export default function ProviderSignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const role = UserRole.THERAPIST;
  const [activeAction, setActiveAction] = useState<
    "email" | "google" | "apple" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const loading = activeAction !== null;

  const handleUniversalAuthSuccess = async (result: UniversalAuthResult) => {
    if (result.status === "NEW_USER") {
      // Auto-initialize profile as THERAPIST/Practitioner on social signup
      const providerProfile = buildRoleBridgeUserProfile(result.user, UserRole.THERAPIST);
      await setDoc(doc(db, "users", result.uid), providerProfile);
      router.push(getAuthRedirectPath(result.user, providerProfile));
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
      router.push(
        getAuthRedirectPath(
          { isAnonymous: false },
          { role, onboardingComplete: false }
        )
      );
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
    <main className="min-h-screen bg-[#f4fcf8] flex items-center justify-center p-6 font-['Plus_Jakarta_Sans'] text-[#2d4d41]">
      <Card variant="solid" className="w-full max-w-md p-8 sm:p-10 border-2 border-[#abcebf] bg-white">
        <header className="mb-8 text-center">
          <Link href="/" className="text-2xl font-extrabold italic text-[#325347]">
            Rant & Heal
          </Link>
          <h1 className="mt-4 text-2xl font-bold uppercase tracking-tight text-[#325347]">
            Practitioner Registration
          </h1>
          <p className="mt-2 text-sm text-[#717974]">
            Set up your clinical account to begin providing care.
          </p>
        </header>

        <div className="space-y-3">
          <Button
            type="button"
            variant="secondary"
            className="w-full justify-between px-5 py-4 text-left uppercase tracking-[0.14em] bg-[#c6ebda]/30 text-[#325347] border border-[#abcebf]"
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
            className="w-full justify-between px-5 py-4 text-left uppercase tracking-[0.14em]"
            onClick={() => handleProviderAuth("apple")}
            isLoading={activeAction === "apple"}
            disabled={loading}
          >
            <span>Continue with Apple</span>
            <span aria-hidden="true" className="text-lg font-bold">
              A
            </span>
          </Button>
        </div>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-[#ffeada]" />
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#717974]">
            Or register with email
          </span>
          <div className="h-px flex-1 bg-[#ffeada]" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && <ErrorMessage>{error}</ErrorMessage>}

          <div className="space-y-2">
            <Label htmlFor="fullname">Full Name & Credentials</Label>
            <Input
              id="fullname"
              type="text"
              placeholder="Dr. Sarah Jenkins, PsyD"
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Work Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="clinical@example.com"
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

          <Button type="submit" variant="primary" className="w-full py-4 tracking-wider uppercase mt-8 bg-[#325347] hover:bg-[#325347]/90" isLoading={loading}>
            Create Professional Profile
          </Button>
        </form>

        <footer className="mt-8 text-center text-sm text-[#414845]">
          Already have a practitioner account?{" "}
          <Link href="/auth/provider/login" className="font-semibold text-[#325347] hover:underline">
            Log In
          </Link>
        </footer>
      </Card>
    </main>
  );
}
