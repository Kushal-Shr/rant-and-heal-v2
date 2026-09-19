"use client";

import Link from "next/link";
import { MarketingFooter } from "@/src/components/layout/MarketingFooter";
import { MomoPortrait } from "@/src/components/shared/MomoPortrait";
import { useCurrentProfile } from "@/src/hooks/useCurrentProfile";
import { UserRole } from "@/src/types/database";

type LandingAction = {
  href: string;
  label: string;
};

const featureCards = [
  {
    id: "momo",
    icon: "smart_toy",
    title: "AI companion",
    body: "Momo gives you a gentle place to put your thoughts into words, without judgment.",
    className: "bg-[#fed1b4] text-[#795841]",
    iconClassName: "text-[#785741]",
  },
  {
    id: "therapists",
    icon: "psychology",
    title: "Verified therapists",
    body: "Browse verified professionals when you want one-to-one human support.",
    className: "bg-[#c6ebda] text-[#002117] md:translate-y-5",
    iconClassName: "text-[#325347]",
  },
  {
    id: "journal",
    icon: "menu_book",
    title: "Journal & mood",
    body: "Write privately and keep a simple record of the rhythms you notice over time.",
    className: "bg-[#ffdbd0] text-[#390b00]",
    iconClassName: "text-[#793b26]",
  },
] as const;

export default function LandingPage() {
  const { user, profile, loading } = useCurrentProfile();
  const profileRole = profile?.role;

  const primaryAction: LandingAction | null = loading
    ? null
    : !user
      ? { href: "/auth/signup", label: "Start with Momo" }
      : profileRole === UserRole.THERAPIST
        ? { href: "/portal", label: "Open practitioner portal" }
        : profileRole === UserRole.USER
          ? { href: "/dashboard", label: "Open your dashboard" }
          : { href: "/auth/onboarding-patient", label: "Complete your profile" };

  const secondaryAction: LandingAction = profileRole === UserRole.THERAPIST
    ? { href: "/patients", label: "View patients" }
    : profileRole === UserRole.USER
    ? { href: "/momo", label: "Talk to Momo" }
    : { href: "#momo", label: "Meet Momo" };

  return (
    <div className="relative min-h-full overflow-hidden font-['Plus_Jakarta_Sans'] text-[#2c1601]">


      <div className="mx-auto flex min-h-full w-full max-w-[92rem] flex-col px-5 py-8 sm:px-8 lg:px-10">
        <section className="flex flex-1 flex-col items-center justify-center pb-16 pt-14 text-center sm:pb-24 sm:pt-20">
          <div className="max-w-3xl">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#4a6b5e]/70">A soft space to begin</p>
            <h1 className="mt-4 text-4xl font-medium tracking-[-0.05em] text-[#4a6b5e] drop-shadow-[0_8px_16px_rgba(74,107,94,0.15)] sm:text-6xl lg:text-7xl">Rant. Reflect. Heal.</h1>
            <p className="mx-auto mt-6 max-w-2xl text-base font-light leading-8 text-[#414845] sm:text-xl">A gentle place to write, check in with yourself, and talk through what&apos;s on your mind with Momo.</p>
          </div>

          <MomoPortrait priority animated className="mt-12 size-52 sm:mt-14 sm:size-72" />

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {primaryAction ? <Link className="clay-link px-8 py-4" href={primaryAction.href}>{primaryAction.label}<span aria-hidden="true" className="material-symbols-outlined text-lg">arrow_forward</span></Link> : <div className="rounded-full bg-[#c6ebda]/70 px-6 py-4 text-sm font-medium text-[#325347]">Preparing your space...</div>}
            <Link className="inline-flex items-center justify-center rounded-full border border-white/80 bg-[#ffe3cd]/70 px-8 py-4 text-sm font-medium text-[#2c1601] shadow-[0_12px_24px_-16px_rgba(121,88,65,0.3),inset_0_2px_4px_rgba(255,255,255,0.65)] transition hover:-translate-y-0.5 hover:bg-[#ffe3cd] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#325347] focus-visible:ring-offset-4 focus-visible:ring-offset-[#fff8f5] active:scale-95" href={secondaryAction.href}>{secondaryAction.label}</Link>
          </div>
        </section>

        <section aria-label="What Rant and Heal offers" className="grid gap-6 pb-12 md:grid-cols-3 md:pb-20">
          {featureCards.map((feature) => (
            <article className={`min-h-72 rounded-[2.5rem] p-7 shadow-[0_20px_40px_-18px_rgba(121,88,65,0.24),inset_0_3px_7px_rgba(255,255,255,0.6)] transition-transform duration-300 hover:-translate-y-2 sm:p-9 ${feature.className}`} id={feature.id} key={feature.id}>
              <div className="flex size-15 items-center justify-center rounded-full bg-white/60 shadow-[0_10px_20px_-12px_rgba(44,22,1,0.25),inset_0_2px_5px_rgba(255,255,255,0.85)]"><span aria-hidden="true" className={`material-symbols-outlined text-3xl ${feature.iconClassName}`} style={{ fontVariationSettings: "'FILL' 1" }}>{feature.icon}</span></div>
              <h2 className="mt-7 text-2xl font-medium tracking-[-0.03em] sm:text-3xl">{feature.title}</h2>
              <p className="mt-5 max-w-sm text-base font-light leading-7 opacity-85">{feature.body}</p>
            </article>
          ))}
        </section>

        <section className="mb-12 grid gap-4 rounded-[2rem] border border-white/80 bg-white/60 p-6 shadow-[0_16px_32px_-20px_rgba(74,107,94,0.18)] backdrop-blur-xl sm:grid-cols-[1fr_auto] sm:items-center sm:p-8" id="mood">
          <div><p className="text-xs font-medium uppercase tracking-[0.12em] text-[#4a6b5e]/70">A simple first step</p><h2 className="mt-2 text-2xl font-medium text-[#325347]">Notice how you&apos;re feeling.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[#414845]">Use a mood check-in or write one honest sentence. You do not need to have everything figured out.</p></div>
          <Link className="inline-flex justify-center rounded-full bg-[#325347] px-5 py-3 text-sm font-medium text-white shadow-[0_8px_16px_-6px_rgba(50,83,71,0.3)] transition hover:bg-[#4a6b5e]" href={profileRole === UserRole.THERAPIST ? "/portal" : profileRole === UserRole.USER ? "/dashboard#check-in" : "/auth/signup"}>{profileRole === UserRole.THERAPIST ? "Open your workspace" : "Check in"}</Link>
        </section>
      </div>
      <MarketingFooter />
    </div>
  );
}
