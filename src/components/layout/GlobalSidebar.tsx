"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authService } from "@/src/services/authService";
import { useCurrentProfile } from "@/src/hooks/useCurrentProfile";
import { UserRole } from "@/src/types/database";
import { MomoPortrait } from "@/src/components/shared/MomoPortrait";

const publicLinks = [
  { label: "Home", href: "/", icon: "home" },
  { label: "Crisis support", href: "/crisis", icon: "favorite" },
];
const patientLinks = [
  { label: "Dashboard", href: "/dashboard", icon: "home" },
  { label: "Talk to Momo", href: "/momo", icon: "cloud" },
  { label: "Journal", href: "/vault", icon: "menu_book" },
  { label: "Find a therapist", href: "/therapy", icon: "groups" },
];
const therapistLinks = [
  { label: "Overview", href: "/portal", icon: "dashboard" },
  { label: "My patients", href: "/patients", icon: "groups" },
  { label: "Messages", href: "/messages", icon: "chat_bubble" },
];

export function GlobalSidebar() {
  const { user, profile, loading, error, retry } = useCurrentProfile();
  const pathname = usePathname();
  const router = useRouter();
  const mobileMenu = useRef<HTMLDetailsElement>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const role = profile?.role;
  const workspaceLinks = role === UserRole.THERAPIST ? therapistLinks : role === UserRole.USER ? patientLinks : [];
  const links = user ? [...workspaceLinks, publicLinks[1]] : publicLinks;
  const home = role === UserRole.THERAPIST ? "/portal" : role === UserRole.USER ? "/dashboard" : "/";
  const subtitle = loading ? "Preparing your space" : role === UserRole.THERAPIST ? "Practitioner workspace" : role === UserRole.USER ? "Your personal sanctuary" : "A soft space to begin";
  const closeMenu = () => { if (mobileMenu.current) mobileMenu.current.open = false; };

  async function signOut() {
    setSigningOut(true);
    setSignOutError(false);
    try {
      await authService.signOut();
      closeMenu();
      router.replace("/");
    } catch {
      setSignOutError(true);
    } finally {
      setSigningOut(false);
    }
  }

  const brand = (
    <Link href={home} onClick={closeMenu} className="flex min-w-0 items-center gap-3 rounded-2xl">
      <MomoPortrait className="size-11" />
      <div className="min-w-0"><p className="text-lg font-semibold tracking-tight text-[#325347]">Rant &amp; Heal</p><p className="mt-0.5 text-[11px] text-[#596c60]">{subtitle}</p></div>
    </Link>
  );

  function navigation(mobile = false) {
    return (
      <>
        <nav aria-label={mobile ? "Mobile navigation" : "Primary navigation"} className="flex flex-col gap-2">
          {links.map((item) => {
            const active = pathname === item.href || (item.href !== "/" && pathname?.startsWith(`${item.href}/`));
            return <Link key={item.href} href={item.href} onClick={closeMenu} aria-current={active ? "page" : undefined}
              className={`flex min-h-12 items-center gap-3 rounded-full px-4 py-3 text-sm font-medium transition-all active:scale-[.98] ${active ? "bg-[#c6ebda]/65 text-[#002117] shadow-[inset_0_2px_6px_#32534712]" : "text-[#596c60] hover:bg-[#fff1e8] hover:text-[#325347]"}`}>
              <span aria-hidden="true" className="material-symbols-outlined text-[21px]">{item.icon}</span>{item.label}
            </Link>;
          })}
        </nav>
        {loading ? <p role="status" className="px-4 py-5 text-xs leading-6 text-[#596c60]">Preparing your space…</p> : error ? <div role="alert" className="mt-4 rounded-2xl bg-[#fff1e8] p-4 text-sm"><p>We couldn’t load your workspace.</p><button className="mt-2 underline" onClick={retry}>Try again</button></div> : user && !role ? <Link className="mt-4 px-4 text-sm underline" href="/auth/onboarding-patient" onClick={closeMenu}>Complete your profile</Link> : null}
        <div className="mt-auto pt-6">
          {!mobile && <div className="mb-6 rounded-[1.75rem] bg-[#fff1e8]/80 px-5 py-5 text-[#795841]"><span aria-hidden="true" className="material-symbols-outlined mb-2 text-xl">spa</span><p className="text-sm font-medium">{role === UserRole.THERAPIST ? "Care starts with you, too." : "At your own pace."}</p><p className="mt-2 text-xs font-light leading-5">{role === UserRole.THERAPIST ? "A little space to breathe between conversations." : "You don’t have to figure it all out today."}</p></div>}
          <div className="border-t border-[#e9e4db] pt-5">
            {user ? <>
              <p className="mb-3 truncate px-2 text-sm font-medium text-[#325347]">{user.displayName || (role === UserRole.THERAPIST ? "Your practice" : "Your account")}</p>
              <button onClick={signOut} disabled={signingOut} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#fff1e8] px-4 py-3 text-sm text-[#795841] transition hover:bg-[#ffe3cd] disabled:opacity-50"><span aria-hidden="true" className="material-symbols-outlined text-lg">logout</span>{signingOut ? "Signing out…" : "Sign out"}</button>
              {signOutError && <p role="alert" className="mt-2 text-xs text-[#93000a]">Couldn’t sign out. Please try again.</p>}
            </> : !loading ? <div className="grid gap-2">
              <Link onClick={closeMenu} className="clay-link" href="/auth/signup">Create an account</Link>
              <Link onClick={closeMenu} className="rounded-full px-4 py-3 text-center text-sm font-medium text-[#325347] hover:bg-[#c6ebda]/30" href="/auth/login">Sign in</Link>
              <Link onClick={closeMenu} className="pt-2 text-center text-xs text-[#596c60] underline decoration-[#abcebf] underline-offset-4" href="/auth/provider/login">For practitioners</Link>
            </div> : null}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <aside className="sticky top-6 my-6 ml-6 hidden h-[calc(100dvh-3rem)] w-64 shrink-0 flex-col overflow-y-auto rounded-[2.5rem] border border-white/80 bg-[#fdfcf8]/90 p-5 shadow-[12px_12px_48px_-24px_#4a6b5e40,inset_0_2px_4px_#ffffff] md:flex">
        <div className="px-1 pb-9 pt-3">{brand}</div>
        {navigation()}
      </aside>
      <header className="sticky top-0 z-40 border-b border-white/80 bg-[#fff8f5]/95 px-4 py-3 backdrop-blur-xl md:hidden">
        <div className="pr-16">{brand}</div>
        <details ref={mobileMenu} onKeyDown={(event) => { if (event.key === "Escape") { closeMenu(); mobileMenu.current?.querySelector("summary")?.focus(); } }} className="group">
          <summary aria-label="Navigation menu" className="absolute right-4 top-3 flex size-11 list-none items-center justify-center rounded-full bg-white text-[#325347] shadow-sm [&::-webkit-details-marker]:hidden"><span className="group-open:hidden"><span aria-hidden="true" className="material-symbols-outlined">menu</span></span><span className="hidden group-open:block"><span aria-hidden="true" className="material-symbols-outlined">close</span></span></summary>
          <div className="max-h-[calc(100dvh-6rem)] overflow-y-auto pb-2 pt-5">{navigation(true)}</div>
        </details>
      </header>
    </>
  );
}
