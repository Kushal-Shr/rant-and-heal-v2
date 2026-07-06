"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/src/context/AuthContext";
import { authService } from "@/src/services/authService";
import { getUserProfile } from "@/src/services/userService";
import { UserRole } from "@/src/types/database";

export function GlobalSidebar() {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [profileRole, setProfileRole] = useState<UserRole | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }

    let isActive = true;

    const fetchProfile = async () => {
      try {
        const profile = await getUserProfile(user.uid);
        if (profile && isActive) {
          setProfileRole(profile.role);
        }
      } catch (error) {
        console.error("Failed to load user profile in GlobalSidebar:", error);
      }
    };

    fetchProfile();

    return () => {
      isActive = false;
    };
  }, [user]);

  const role = user ? profileRole : null;

  const handleSignOut = async () => {
    try {
      await authService.signOut();
      router.push("/");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  // Nav items based on role
  const getNavItems = () => {
    if (!user) {
      return [
        { label: "Home", href: "/", icon: "home" },
        { label: "Crisis Support", href: "/crisis", icon: "emergency" },
      ];
    }

    if (role === UserRole.THERAPIST) {
      return [
        { label: "Portal", href: "/portal", icon: "dashboard" },
        { label: "Patients", href: "/patients", icon: "groups" },
        { label: "Messages", href: "/messages", icon: "chat_bubble" },
      ];
    }

    // Default to Patient links for USER/Patient role or during anonymous login
    return [
      { label: "Dashboard", href: "/dashboard", icon: "home" },
      { label: "Momo", href: "/momo", icon: "cloud" },
      { label: "Directory", href: "/therapy", icon: "groups" },
      { label: "Vault", href: "/vault", icon: "shield_with_heart" },
    ];
  };

  const navItems = getNavItems();

  return (
    <aside className="hidden h-full w-64 flex-col border-r border-[#ffeada] bg-[#FDFCF8] p-5 font-['Plus_Jakarta_Sans'] text-[#325347] md:flex">
      {/* Brand Logo Header */}
      <div className="mb-10 mt-4 px-3">
        <Link href="/" className="flex items-center gap-3 active:scale-95 transition-transform">
          <div className="flex size-11 items-center justify-center rounded-full bg-[#c6ebda] text-[#325347] shadow-[0_8px_16px_-4px_rgba(50,83,71,0.15),inset_0_2px_4px_rgba(255,255,255,0.6)]">
            <span className="text-base font-extrabold">RH</span>
          </div>
          <div>
            <h2 className="text-lg font-bold leading-none text-emerald-900">Rant & Heal</h2>
            <p className="mt-1 text-[10px] font-semibold text-[#414845]/70 uppercase tracking-wider">
              {user ? (role === UserRole.THERAPIST ? "Practitioner Portal" : "Patient Sanctuary") : "Welcome"}
            </p>
          </div>
        </Link>
      </div>

      {/* Navigation Links */}
      <nav className="flex flex-1 flex-col gap-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-4 rounded-full px-4 py-3 text-sm font-medium transition-all active:scale-95 ${
                isActive
                  ? "bg-[#c6ebda]/50 text-emerald-900 shadow-inner"
                  : "text-emerald-800/60 hover:translate-x-1 hover:bg-emerald-50/50"
              }`}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-lg">
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer Area with Auth actions */}
      <div className="mt-auto border-t border-[#ffeada] pt-4 flex flex-col gap-2">
        {user ? (
          <button
            onClick={handleSignOut}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-[#ffdad6] py-3 text-sm font-medium text-[#93000a] shadow-[0_8px_16px_-4px_rgba(186,26,26,0.16)] active:scale-95 transition-transform cursor-pointer"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-lg">
              logout
            </span>
            Sign Out
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <Link
              href="/auth/login"
              className="flex w-full items-center justify-center rounded-full border border-[#ffeada] bg-white py-3 text-sm font-medium text-[#325347] shadow-sm hover:bg-[#ffeada]/30 active:scale-95 transition-transform text-center"
            >
              Sign In
            </Link>
            <Link
              href="/auth/signup"
              className="flex w-full items-center justify-center rounded-full bg-[#325347] py-3 text-sm font-medium text-white shadow-[0_8px_16px_-4px_rgba(50,83,71,0.2)] hover:bg-[#325347]/95 active:scale-95 transition-transform text-center"
            >
              Sign Up
            </Link>
            <Link
              href="/auth/provider/login"
              className="mt-2 text-center text-xs font-semibold text-emerald-800/50 hover:text-emerald-800/80 transition-colors"
            >
              For Practitioners
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}
