import type { LabelHTMLAttributes, ReactNode } from "react";

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  children: ReactNode;
  required?: boolean;
}

export function Label({ children, className = "", required = false, ...props }: LabelProps) {
  return (
    <label
      className={`ml-2 inline-flex items-center gap-1 font-['Plus_Jakarta_Sans'] text-xs font-medium leading-[1.2] text-[#414845] ${className}`}
      {...props}
    >
      {children}
      {required ? <span className="text-[#ba1a1a]">*</span> : null}
    </label>
  );
}

