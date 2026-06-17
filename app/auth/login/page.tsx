"use client";

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
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getAuthRedirectPath, type RoutableUserDoc } from "@/src/utils/authRouter";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [activeAction, setActiveAction] = useState<
    "email" | "google" | "apple" | "guest" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const loading = activeAction !== null;

  const handleUniversalAuthSuccess = async (result: UniversalAuthResult) => {
    if (result.status === "NEW_USER") {
      if (result.user.isAnonymous) {
        const guestProfile = buildAnonymousUserProfile(result.user);
        await setDoc(doc(db, "users", result.uid), guestProfile);
        router.push(getAuthRedirectPath(result.user, guestProfile));
        return;
      }

      // Initialize database profile as USER/Patient on social login
      const patientProfile = buildRoleBridgeUserProfile(result.user, UserRole.USER);
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
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setActiveAction("email");
    setError(null);

    try {
      const userCredential = await authService.signInWithEmail(email, password);
      const user = userCredential.user;
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        throw new Error("User profile not found in database.");
      }

      router.push(
        getAuthRedirectPath(user, userDocSnap.data() as RoutableUserDoc)
      );
    } catch (error: unknown) {
      setError(getErrorMessage(error, "Invalid credentials. Please try again."));
    } finally {
      setActiveAction(null);
    }
  };

  const handleProviderAuth = async (provider: "google" | "apple" | "guest") => {
    setActiveAction(provider);
    setError(null);

    try {
      const result =
        provider === "google"
          ? await authService.signInWithGoogle()
          : provider === "apple"
            ? await authService.signInWithApple()
            : await authService.continueAsGuest();

      await handleUniversalAuthSuccess(result);
    } catch (error: unknown) {
      setError(getErrorMessage(error, "Authentication failed. Please try again."));
    } finally {
      setActiveAction(null);
    }
  };

  return (
    <main className="min-h-screen bg-[#fff8f5] flex items-center justify-center p-6 font-['Plus_Jakarta_Sans'] text-[#2c1601]">
      <Card variant="solid" className="w-full max-w-md p-8 sm:p-10">
        <header className="mb-8 text-center">
          <Link href="/" className="text-2xl font-extrabold italic text-[#4a6b5e]">
            Rant & Heal
          </Link>
          <h1 className="mt-4 text-3xl font-bold uppercase tracking-tight text-[#325347]">
            Welcome Back
          </h1>
          <p className="mt-2 text-sm text-[#414845]">
            Sign in to continue to your secure vault.
          </p>
        </header>

        <div className="space-y-3">
          <Button
            type="button"
            variant="secondary"
            className="w-full justify-between px-5 py-4 text-left uppercase tracking-[0.14em]"
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

          <Button
            type="button"
            variant="ghost"
            className="w-full justify-between rounded-[2rem] border border-dashed border-[#abcebf] bg-white/40 px-5 py-4 text-left uppercase tracking-[0.14em] text-[#325347] hover:bg-[#c6ebda]/20"
            onClick={() => handleProviderAuth("guest")}
            isLoading={activeAction === "guest"}
            disabled={loading}
          >
            <span>Continue as Guest</span>
            <span aria-hidden="true" className="text-lg font-bold">
              ?
            </span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full justify-between rounded-[2rem] border border-[#ffe3cd] bg-[#fff1e8] px-5 py-4 text-left uppercase tracking-[0.14em] text-[#795841] hover:bg-[#ffe3cd]"
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
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#717974]">
            Or with email
          </span>
          <div className="h-px flex-1 bg-[#ffe3cd]" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && <ErrorMessage>{error}</ErrorMessage>}

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

          <Button type="submit" variant="primary" className="w-full py-4 tracking-wider uppercase mt-8" isLoading={loading}>
            Log In
          </Button>
        </form>

        <footer className="mt-8 text-center text-sm text-[#414845]">
          New to Rant & Heal?{" "}
          <Link href="/auth/signup" className="font-semibold text-[#325347] hover:underline">
            Create Account
          </Link>
        </footer>
      </Card>
    </main>
  );
}
