import type { HTMLAttributes } from "react";

const sizeClasses = {
  sm: "size-5 border-2",
  md: "size-8 border-[3px]",
  lg: "size-12 border-4",
} as const;

export interface SpinnerProps extends HTMLAttributes<HTMLDivElement> {
  size?: keyof typeof sizeClasses;
  label?: string;
}

export function Spinner({
  className = "",
  label = "Loading",
  size = "md",
  ...props
}: SpinnerProps) {
  return (
    <div className={`inline-flex items-center gap-3 text-[#325347] ${className}`} {...props}>
      <span
        aria-label={label}
        className={`${sizeClasses[size]} animate-spin rounded-full border-[#c6ebda] border-t-[#325347] shadow-[0_8px_20px_-8px_rgba(74,107,94,0.4)]`}
        role="status"
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}

