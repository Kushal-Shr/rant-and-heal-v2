import type { HTMLAttributes, ReactNode } from "react";

const variantClasses = {
  default:
    "bg-white/60 border border-white/80 shadow-[0_10px_30px_-15px_rgba(74,107,94,0.1),inset_0_2px_4px_rgba(255,255,255,0.5)] backdrop-blur-xl",
  solid:
    "bg-white text-[#2c1601] shadow-[0_20px_40px_-15px_rgba(121,88,65,0.15),0_10px_20px_-10px_rgba(121,88,65,0.1)]",
  peach:
    "bg-[#fed1b4] text-[#795841] border border-white/60 shadow-[0_20px_40px_-10px_rgba(121,88,65,0.1),0_10px_15px_-5px_rgba(121,88,65,0.05),inset_0_2px_4px_rgba(255,255,255,0.8)]",
  sage:
    "bg-[#c6ebda] text-[#002117] border border-white/60 shadow-[0_20px_40px_-10px_rgba(74,107,94,0.12),inset_0_2px_4px_rgba(255,255,255,0.8)]",
  inset:
    "bg-[#fff1e8] text-[#2c1601] border border-[#ffeada] shadow-[inset_0_4px_10px_rgba(44,22,1,0.04)]",
} as const;

const paddingClasses = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
} as const;

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: keyof typeof variantClasses;
  padding?: keyof typeof paddingClasses;
}

export function Card({
  children,
  className = "",
  padding = "md",
  variant = "default",
  ...props
}: CardProps) {
  return (
    <div
      className={`rounded-[2.5rem] ${variantClasses[variant]} ${paddingClasses[padding]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

