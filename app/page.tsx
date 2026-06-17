"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { MarketingFooter } from "@/src/components/layout/MarketingFooter";
import { Button } from "@/src/components/ui/Button";
import { Card } from "@/src/components/ui/Card";
import { useAuth } from "@/src/context/AuthContext";
import { getUserProfile } from "@/src/services/userService";
import { UserRole } from "@/src/types/database";

export default function LandingPage() {
  const { user, loading } = useAuth();
  const [role, setRole] = useState<UserRole | null>(null);

  useEffect(() => {
    if (!user) {
      setRole(null);
      return;
    }

    const fetchRole = async () => {
      try {
        const profile = await getUserProfile(user.uid);
        if (profile) {
          setRole(profile.role);
        }
      } catch (err) {
        console.error("Error checking role on landing page:", err);
      }
    };

    fetchRole();
  }, [user]);

  const renderCTAs = () => {
    if (loading) {
      return (
        <div className="h-14 flex items-center justify-center">
          <div className="animate-pulse text-[#4a6b5e] font-medium">Preparing your sanctuary...</div>
        </div>
      );
    }

    if (!user) {
      return (
        <div className="flex justify-center items-center">
          <Link href="/auth/signup" className="w-full sm:w-auto">
            <Button size="lg" variant="primary" className="px-10 py-5 w-full uppercase tracking-wider text-base font-bold rounded-full shadow-md">
              GET STARTED AS A PATIENT
            </Button>
          </Link>
        </div>
      );
    }

    if (role === UserRole.THERAPIST) {
      return (
        <Link href="/portal" className="w-full sm:w-auto">
          <Button size="lg" variant="primary" className="px-12 py-5 uppercase tracking-widest text-lg font-black rounded-full shadow-[0_15px_30px_rgba(50,83,71,0.25)] hover:scale-105 active:scale-95 transition-transform">
            Return to Portal
          </Button>
        </Link>
      );
    }

    return (
      <Link href="/dashboard" className="w-full sm:w-auto">
        <Button size="lg" variant="primary" className="px-12 py-5 uppercase tracking-widest text-lg font-black rounded-full shadow-[0_15px_30px_rgba(50,83,71,0.25)] hover:scale-105 active:scale-95 transition-transform">
          Return to Dashboard
        </Button>
      </Link>
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#fff8f5] text-[#2c1601] font-['Plus_Jakarta_Sans']">
      <main className="flex-1 flex flex-col items-center justify-center max-w-6xl mx-auto px-6 py-20 text-center">
        {/* Hero Section */}
        <section className="mb-20">
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-[#325347] uppercase leading-[1.1] mb-6">
            YOUR MIND.<br />YOUR VAULT.<br />YOUR RULES.
          </h1>
          <p className="text-lg md:text-xl text-[#414845] max-w-2xl mx-auto mb-10 leading-relaxed">
            Welcome to a secure sanctuary for mental well-being. Experience empathetic 24/7 AI-guided support paired with private, end-to-end encrypted clinical therapy.
          </p>

          {renderCTAs()}
        </section>

        {/* Feature Highlights */}
        <section className="w-full px-4 mb-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card variant="solid" className="flex flex-col items-center text-center p-8">
              <div className="size-16 rounded-full bg-[#c6ebda]/50 flex items-center justify-center text-3xl mb-6 shadow-sm">
                💬
              </div>
              <h3 className="text-2xl font-bold mb-3 text-[#325347]">AI Momo</h3>
              <p className="text-base text-[#414845] leading-relaxed">
                Your 24/7 empathetic digital companion. Safe, instant, conversational triage to help you unpack thoughts whenever you need.
              </p>
            </Card>

            <Card variant="solid" className="flex flex-col items-center text-center p-8">
              <div className="size-16 rounded-full bg-[#ffeada] flex items-center justify-center text-3xl mb-6 shadow-sm">
                🔒
              </div>
              <h3 className="text-2xl font-bold mb-3 text-[#325347]">Zero-Trust Vault</h3>
              <p className="text-base text-[#414845] leading-relaxed">
                Complete data autonomy. Write your journal entries inside a secure sandbox where only you control access keys.
              </p>
            </Card>

            <Card variant="solid" className="flex flex-col items-center text-center p-8">
              <div className="size-16 rounded-full bg-[#fff1e8] border border-[#ffeada] flex items-center justify-center text-3xl mb-6 shadow-sm">
                🤝
              </div>
              <h3 className="text-2xl font-bold mb-3 text-[#325347]">Verified Therapy</h3>
              <p className="text-base text-[#414845] leading-relaxed">
                Connect directly with licensed clinicians. Access safe digital chat rooms and high-fidelity video session suites.
              </p>
            </Card>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
