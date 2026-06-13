import type { HTMLAttributes, ReactNode } from "react";

const variantClasses = {
  sage: "bg-[#abcebf]/20 text-[#2d4d41]",
  peach: "bg-[#fed1b4] text-[#795841]",
  clay: "bg-[#ffe3cd] text-[#414845]",
  rose: "bg-[#ffdad6] text-[#93000a]",
  moss: "bg-[#4a6b5e] text-white",
} as const;

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  variant?: keyof typeof variantClasses;
}

export function Badge({ children, className = "", variant = "sage", ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-4 py-2 font-['Plus_Jakarta_Sans'] text-xs font-medium leading-[1.2] ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}

