"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/src/components/ui/Button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("ROUTE ERROR:", error.digest ?? error.message);
  }, [error]);
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <section className="clay-card max-w-lg p-8 text-center">
        <span aria-hidden="true" className="material-symbols-outlined text-4xl text-[#795841]">cloud_off</span>
        <h1 className="mt-4 text-3xl font-medium text-[#325347]">This space needs another moment</h1>
        <p className="mt-3 text-sm leading-6 text-[#414845]">Your information is still safe. Try loading the page again.</p>
        <div className="mt-6 flex justify-center gap-3"><Button onClick={reset}>Try again</Button><Link className="clay-link" href="/">Go home</Link></div>
      </section>
    </div>
  );
}
