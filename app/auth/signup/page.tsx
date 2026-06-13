"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authService } from "@/src/services/authService";
import { Button } from "@/src/components/ui/Button";
import { Card } from "@/src/components/ui/Card";
import { Input } from "@/src/components/forms/Input";
import { Label } from "@/src/components/forms/Label";
import { ErrorMessage } from "@/src/components/forms/ErrorMessage";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("USER"); // Defaulting to USER (Patient) as defined in our schema/service
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name || !email || !password) {
      setError("Please fill out all fields.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Calling authService.signUpWithEmail which creates user credentials AND sets document in Firestore.
      await authService.signUpWithEmail(email, password, name, role);

      // Route the user to onboarding based on role.
      if (role === "THERAPIST") {
        router.push("/auth/onboarding-therapist");
      } else {
        router.push("/auth/onboarding-patient");
      }
    } catch (err: any) {
      setError(err?.message || "Registration failed. Please try again.");
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
            Create Account
          </h1>
          <p className="mt-2 text-sm text-[#414845]">
            Start your secure mental health journey today.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && <ErrorMessage>{error}</ErrorMessage>}

          <div className="space-y-2">
            <Label htmlFor="fullname">Full Name</Label>
            <Input
              id="fullname"
              type="text"
              placeholder="Dr. Sarah Jenkins or John Doe"
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

          <div className="space-y-2">
            <Label htmlFor="role">I am joining as a</Label>
            <div className="relative">
              <select
                id="role"
                value={role}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setRole(e.target.value)}
                disabled={loading}
                className="w-full rounded-full border-none bg-[#ffeada] px-4 py-4 font-['Plus_Jakarta_Sans'] text-base font-light leading-[1.6] text-[#2c1601] shadow-[inset_0_4px_6px_-1px_rgba(44,22,1,0.1)] outline-none transition-all focus:bg-white focus:ring-2 focus:ring-[#4a6b5e] disabled:cursor-not-allowed disabled:opacity-60 appearance-none cursor-pointer"
                required
              >
                <option value="USER">Patient (seeking care)</option>
                <option value="THERAPIST">Practitioner (clinical therapist)</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[#4a6b5e]">
                ▼
              </div>
            </div>
          </div>

          <Button type="submit" variant="primary" className="w-full py-4 tracking-wider uppercase mt-8" isLoading={loading}>
            Sign Up
          </Button>
        </form>

        <footer className="mt-8 text-center text-sm text-[#414845]">
          Already have an account?{" "}
          <Link href="/auth/login" className="font-semibold text-[#325347] hover:underline">
            Log In
          </Link>
        </footer>
      </Card>
    </main>
  );
}
