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
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getAuthRedirectPath, type RoutableUserDoc } from "@/src/utils/authRouter";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function ProviderLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [activeAction, setActiveAction] = useState<
    "email" | "google" | "apple" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const loading = activeAction !== null;

  const handleUniversalAuthSuccess = async (result: UniversalAuthResult) => {
    if (result.status === "NEW_USER") {
      // Auto-initialize profile as THERAPIST/Practitioner on social login
      const providerProfile = buildRoleBridgeUserProfile(result.user, UserRole.THERAPIST);
      await setDoc(doc(db, "users", result.uid), providerProfile);
      router.push(getAuthRedirectPath(result.user, providerProfile));
      return;
    }

    const userData = result.userDoc as RoutableUserDoc;
    if (userData.role !== UserRole.THERAPIST) {
      await authService.signOut();
      throw new Error("Access denied. This portal is for practitioners only.");
    }

    router.push(
      getAuthRedirectPath(result.user, userData)
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

      const userData = userDocSnap.data() as RoutableUserDoc;
      if (userData.role !== UserRole.THERAPIST) {
        // Log them out and throw error if a patient attempts provider login
        await authService.signOut();
        throw new Error("Access denied. This portal is for practitioners only.");
      }

      router.push(
        getAuthRedirectPath(user, userData)
      );
    } catch (error: unknown) {
      setError(getErrorMessage(error, "Invalid credentials or unauthorized account."));
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
          ? await authService.signInWithGoogle(UserRole.THERAPIST)
          : await authService.signInWithApple(UserRole.THERAPIST);

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
            Practitioner Portal
          </h1>
          <p className="mt-2 text-sm text-[#717974]">
            Sign in to access secure clinical workspaces.
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
            Or with email
          </span>
          <div className="h-px flex-1 bg-[#ffeada]" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && <ErrorMessage>{error}</ErrorMessage>}

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
            Sign In to Portal
          </Button>
        </form>

        <footer className="mt-8 text-center text-sm text-[#414845]">
          New practitioner?{" "}
          <Link href="/auth/provider/signup" className="font-semibold text-[#325347] hover:underline">
            Register Here
          </Link>
        </footer>
      </Card>
    </main>
  );
}
