"use client";

import { CrisisSupportPanel } from "../shared/CrisisSupportPanel";

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
      <div className="w-full max-w-2xl">
        <CrisisSupportPanel onClose={onClose} />
      </div>
    </div>
  );
}
