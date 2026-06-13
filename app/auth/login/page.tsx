"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authService } from "@/src/services/authService";
import { db } from "@/src/config/firebase";
import { doc, getDoc } from "firebase/firestore";
import { Button } from "@/src/components/ui/Button";
import { Card } from "@/src/components/ui/Card";
import { Input } from "@/src/components/forms/Input";
import { Label } from "@/src/components/forms/Label";
import { ErrorMessage } from "@/src/components/forms/ErrorMessage";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Authenticate with Firebase Auth
      const userCredential = await authService.signInWithEmail(email, password);
      const user = userCredential.user;

      // 2. Fetch the user profile from Firestore at users/{uid}
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        throw new Error("User profile not found in database.");
      }

      const userData = userDocSnap.data();
      const role = userData.role;
      const onboardingComplete = userData.onboardingComplete;

      // 3. Routing Fork Matrix
      if (role === "USER" && !onboardingComplete) {
        router.push("/auth/onboarding-patient");
      } else if (role === "THERAPIST" && !onboardingComplete) {
        router.push("/auth/onboarding-therapist");
      } else if (role === "USER" && onboardingComplete) {
        router.push("/dashboard");
      } else if (role === "THERAPIST" && onboardingComplete) {
        router.push("/portal");
      } else {
        // Fallback in case of custom configurations or undefined values
        router.push("/dashboard");
      }
    } catch (err: any) {
      setError(err?.message || "Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
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
