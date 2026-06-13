"use client";

import type { InputHTMLAttributes, ReactNode } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: ReactNode;
  hasError?: boolean;
}

export function Input({ className = "", hasError = false, leftIcon, ...props }: InputProps) {
  return (
    <div className="relative">
      {leftIcon ? (
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#c1c8c3]">
          {leftIcon}
        </span>
      ) : null}
      <input
        className={`w-full rounded-full border-none bg-[#ffeada] px-4 py-4 font-['Plus_Jakarta_Sans'] text-base font-light leading-[1.6] text-[#2c1601] shadow-[inset_0_4px_6px_-1px_rgba(44,22,1,0.1),inset_0_2px_4px_-1px_rgba(44,22,1,0.06)] outline-none transition-all placeholder:text-[#c1c8c3] focus:bg-white focus:ring-2 focus:ring-[#4a6b5e] disabled:cursor-not-allowed disabled:opacity-60 ${
          leftIcon ? "pl-12" : ""
        } ${hasError ? "ring-2 ring-[#ba1a1a]" : ""} ${className}`}
        {...props}
      />
    </div>
  );
}

