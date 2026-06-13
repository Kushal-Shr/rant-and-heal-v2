import type { HTMLAttributes, ReactNode } from "react";

export interface ErrorMessageProps extends HTMLAttributes<HTMLParagraphElement> {
  children?: ReactNode;
}

export function ErrorMessage({ children, className = "", ...props }: ErrorMessageProps) {
  if (!children) return null;

  return (
    <p
      className={`rounded-2xl bg-[#ffdad6] px-4 py-3 font-['Plus_Jakarta_Sans'] text-sm font-medium leading-[1.2] text-[#93000a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.5)] ${className}`}
      role="alert"
      {...props}
    >
      {children}
    </p>
  );
}

