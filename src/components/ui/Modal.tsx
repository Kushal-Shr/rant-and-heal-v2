"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { Button } from "./Button";

export interface ModalProps {
  children: ReactNode;
  isOpen: boolean;
  title?: string;
  description?: string;
  onClose: () => void;
  closeLabel?: string;
  className?: string;
}

export function Modal({
  children,
  className = "",
  closeLabel = "Close",
  description,
  isOpen,
  onClose,
  title,
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex min-h-screen items-center justify-center bg-[#2c1601]/30 p-6 backdrop-blur-md"
      role="dialog"
    >
      <button
        aria-label={closeLabel}
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        type="button"
      />
      <section
        className={`relative w-full max-w-lg overflow-hidden rounded-[3rem] bg-white p-8 text-[#2c1601] shadow-[0_40px_80px_-20px_rgba(74,107,94,0.25),0_20px_40px_-10px_rgba(120,87,65,0.18),inset_0_2px_4px_rgba(255,255,255,0.8)] ${className}`}
      >
        <div className="absolute -right-10 -top-10 size-36 rounded-full bg-[#c6ebda]/40 blur-2xl" />
        <div className="relative z-10">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              {title ? (
                <h2 className="font-['Plus_Jakarta_Sans'] text-2xl font-medium leading-[1.4] text-[#325347]">
                  {title}
                </h2>
              ) : null}
              {description ? (
                <p className="mt-2 font-['Plus_Jakarta_Sans'] text-base font-light leading-[1.6] text-[#414845]">
                  {description}
                </p>
              ) : null}
            </div>
            <Button aria-label={closeLabel} onClick={onClose} size="icon" variant="ghost">
              <span aria-hidden="true">x</span>
            </Button>
          </div>
          {children}
        </div>
      </section>
    </div>
  );
}

