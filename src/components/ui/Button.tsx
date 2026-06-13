"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

const baseButtonClasses =
  "inline-flex items-center justify-center gap-2 rounded-full font-['Plus_Jakarta_Sans'] text-sm font-medium leading-[1.2] tracking-[0.01em] transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#abcebf] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fff8f5] active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50";

const variantClasses = {
  primary:
    "bg-[#325347] text-white shadow-[0_8px_16px_-4px_rgba(50,83,71,0.2),0_4px_8px_-4px_rgba(50,83,71,0.1),inset_0_1px_0_rgba(255,255,255,0.4)] hover:bg-[#4a6b5e]",
  secondary:
    "bg-[#ffe3cd] text-[#2c1601] border border-white/50 shadow-[0_20px_40px_-10px_rgba(121,88,65,0.15),0_10px_20px_-5px_rgba(121,88,65,0.1),inset_0_2px_5px_rgba(255,255,255,0.8),inset_0_-2px_5px_rgba(0,0,0,0.05)] hover:bg-[#ffdcbf]",
  ghost:
    "bg-transparent text-[#414845] hover:bg-[#c6ebda]/30 hover:text-[#325347]",
  outline:
    "bg-transparent text-[#4a6b5e] border-2 border-[#4a6b5e] shadow-[0_8px_20px_-5px_rgba(121,88,65,0.15),inset_0_1px_2px_rgba(255,255,255,0.5)] hover:bg-[#abcebf]/10",
  danger:
    "bg-[#ffdad6] text-[#93000a] shadow-[0_8px_16px_-4px_rgba(186,26,26,0.16),inset_0_1px_0_rgba(255,255,255,0.55)] hover:bg-[#ffb4ab]",
} as const;

const sizeClasses = {
  sm: "px-4 py-2",
  md: "px-6 py-3",
  lg: "px-8 py-4",
  icon: "size-11 p-0",
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: keyof typeof variantClasses;
  size?: keyof typeof sizeClasses;
  isLoading?: boolean;
}

export function Button({
  children,
  className = "",
  disabled,
  isLoading = false,
  size = "md",
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${baseButtonClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      disabled={disabled || isLoading}
      type={type}
      {...props}
    >
      {isLoading ? (
        <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : null}
      {children}
    </button>
  );
}

