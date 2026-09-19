import Link from "next/link";
import { CrisisSupportPanel } from "@/src/components/shared/CrisisSupportPanel";

export default function CrisisPage() {
  return (
    <div className="min-h-[calc(100dvh-5rem)] md:min-h-dvh px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link className="inline-flex items-center gap-1 rounded-full bg-white/75 px-4 py-2 font-['Plus_Jakarta_Sans'] text-sm font-medium text-[#325347] shadow-sm transition hover:bg-[#fff1e8]" href="/">
          <span aria-hidden="true" className="material-symbols-outlined text-base">arrow_back</span> Back to home
        </Link>
        <div className="mt-6">
          <CrisisSupportPanel />
        </div>
      </div>
    </div>
  );
}
