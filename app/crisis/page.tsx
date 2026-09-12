import Link from "next/link";
import { CrisisSupportPanel } from "@/src/components/shared/CrisisSupportPanel";

export default function CrisisPage() {
  return (
    <main className="min-h-screen bg-brutalBg px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link className="font-['Plus_Jakarta_Sans'] text-sm font-black uppercase tracking-[0.16em] underline" href="/">
          Back to home
        </Link>
        <div className="mt-6">
          <CrisisSupportPanel />
        </div>
      </div>
    </main>
  );
}
