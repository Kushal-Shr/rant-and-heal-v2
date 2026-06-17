"use client";

import { Button } from "../ui/Button";

export interface EmergencyOverlayProps {
  isOpen: boolean;
  onClose?: () => void;
}

export function EmergencyOverlay({ isOpen, onClose }: EmergencyOverlayProps) {
  if (!isOpen) return null;

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex min-h-screen items-center justify-center bg-[#ba1a1a]/20 p-6 backdrop-blur-md"
      role="dialog"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-[3rem] bg-[#fff8f5] p-8 text-[#2c1601] shadow-[0_40px_80px_-20px_rgba(186,26,26,0.3),0_20px_40px_-10px_rgba(120,87,65,0.18),inset_0_2px_4px_rgba(255,255,255,0.8)] border-2 border-[#ba1a1a]">
        <div className="absolute -right-10 -top-10 size-36 rounded-full bg-[#ffdad6] blur-2xl animate-pulse" />
        <div className="relative z-10 text-center">
          <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-[#ffdad6] text-[#ba1a1a] shadow-sm">
            <span aria-hidden="true" className="material-symbols-outlined text-3xl font-bold">
              warning
            </span>
          </div>

          <h2 className="font-['Plus_Jakarta_Sans'] text-2xl font-bold leading-[1.4] text-[#ba1a1a] uppercase tracking-wide">
            Emergency Crisis Assistance
          </h2>

          <p className="mt-4 font-['Plus_Jakarta_Sans'] text-base font-light leading-[1.6] text-[#414845]">
            If you are in immediate danger, experiencing a severe mental health crisis, or thinking about self-harm, please reach out for professional help immediately.
          </p>

          <div className="my-6 rounded-[2rem] bg-[#ffdad6]/50 p-4 border border-[#ffdad6]">
            <p className="font-['Plus_Jakarta_Sans'] text-lg font-bold text-[#ba1a1a]">
              National Suicide & Crisis Lifeline
            </p>
            <p className="mt-1 text-2xl font-black text-[#2c1601]">
              Call or Text: 988
            </p>
            <p className="mt-1 text-xs text-[#414845]/70">
              Free, confidential, 24/7 assistance
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <a
              href="tel:988"
              className="inline-block"
            >
              <Button
                className="w-full bg-[#ba1a1a] hover:bg-[#ba1a1a]/90 text-white font-bold uppercase tracking-wider py-4 rounded-full active:scale-95 transition-transform"
                variant="primary"
              >
                Call 988 Now
              </Button>
            </a>
            {onClose && (
              <Button
                onClick={onClose}
                className="w-full text-[#4a6b5e] hover:bg-emerald-50/50 py-3 rounded-full active:scale-95 transition-transform"
                variant="ghost"
              >
                Close Overlay
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
