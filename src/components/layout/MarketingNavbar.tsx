"use client";

import Link from "next/link";
import { useState } from "react";

export interface MarketingNavItem {
  label: string;
  href: string;
}

export interface MarketingNavbarProps {
  brandName?: string;
  items?: MarketingNavItem[];
  ctaLabel?: string;
  ctaHref?: string;
}

const defaultItems: MarketingNavItem[] = [
  { label: "Home", href: "/" },
  { label: "Momo", href: "/momo" },
  { label: "Directory", href: "/therapy" },
  { label: "Sign In", href: "/auth/login" },
];

export function MarketingNavbar({
  brandName = "Rant & Heal",
  ctaHref = "/auth/signup",
  ctaLabel = "Start Ranting",
  items = defaultItems,
}: MarketingNavbarProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="sticky top-4 z-40 mx-4 rounded-full border border-white/60 bg-[#fff8f5]/80 px-4 py-3 font-['Plus_Jakarta_Sans'] shadow-[0_15px_40px_-10px_rgba(74,107,94,0.16),inset_0_2px_4px_rgba(255,255,255,0.7)] backdrop-blur-xl md:mx-8">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <Link className="text-xl font-extrabold italic text-[#4a6b5e]" href="/">
          {brandName}
        </Link>
        <div className="hidden items-center gap-2 md:flex">
          {items.map((item) => (
            <Link
              className="rounded-full px-4 py-2 text-sm font-medium text-[#414845] transition-all hover:bg-[#c6ebda]/30 hover:text-[#325347] active:scale-95"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
          <Link
            className="ml-2 inline-flex items-center justify-center rounded-full bg-[#325347] px-4 py-2 font-['Plus_Jakarta_Sans'] text-sm font-medium leading-[1.2] tracking-[0.01em] text-white shadow-[0_8px_16px_-4px_rgba(50,83,71,0.2),0_4px_8px_-4px_rgba(50,83,71,0.1),inset_0_1px_0_rgba(255,255,255,0.4)] transition-all hover:bg-[#4a6b5e] active:scale-[0.96]"
            href={ctaHref}
          >
            {ctaLabel}
          </Link>
        </div>
        <button
          aria-expanded={isOpen}
          aria-label="Toggle navigation"
          className="rounded-full bg-[#ffeada] p-3 text-[#325347] shadow-[inset_0_2px_6px_rgba(44,22,1,0.08)] active:scale-95 md:hidden"
          onClick={() => setIsOpen((current) => !current)}
          type="button"
        >
          <span aria-hidden="true">{isOpen ? "x" : "menu"}</span>
        </button>
      </nav>
      {isOpen ? (
        <div className="mt-4 flex flex-col gap-2 rounded-[2rem] bg-white/70 p-3 md:hidden">
          {items.map((item) => (
            <Link
              className="rounded-full px-4 py-3 text-sm font-medium text-[#414845] hover:bg-[#c6ebda]/30"
              href={item.href}
              key={item.href}
              onClick={() => setIsOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <Link
            className="rounded-full bg-[#325347] px-4 py-3 text-center text-sm font-medium text-white shadow-[0_8px_16px_-4px_rgba(50,83,71,0.2),inset_0_1px_0_rgba(255,255,255,0.4)]"
            href={ctaHref}
            onClick={() => setIsOpen(false)}
          >
            {ctaLabel}
          </Link>
        </div>
      ) : null}
    </header>
  );
}
