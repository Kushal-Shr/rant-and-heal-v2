"use client";

import type { TextareaHTMLAttributes } from "react";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
  lined?: boolean;
}

export function Textarea({
  className = "",
  hasError = false,
  lined = false,
  rows = 4,
  ...props
}: TextareaProps) {
  return (
    <textarea
      className={`w-full resize-none rounded-[2rem] border-none bg-[#fff1e8] p-6 font-['Plus_Jakarta_Sans'] text-base font-light leading-[1.6] text-[#2c1601] shadow-[inset_0_4px_10px_rgba(44,22,1,0.05)] outline-none transition-all placeholder:text-[#c1c8c3] focus:bg-white focus:ring-2 focus:ring-[#abcebf] disabled:cursor-not-allowed disabled:opacity-60 ${
        lined
          ? "bg-[linear-gradient(rgba(138,104,72,0.15)_1px,transparent_1px)] bg-[length:100%_1.6em] bg-origin-content"
          : ""
      } ${hasError ? "ring-2 ring-[#ba1a1a]" : ""} ${className}`}
      rows={rows}
      {...props}
    />
  );
}

