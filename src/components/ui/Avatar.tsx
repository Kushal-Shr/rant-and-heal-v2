import Image from "next/image";
import type { HTMLAttributes } from "react";

const sizeClasses = {
  sm: "size-8 text-xs",
  md: "size-12 text-sm",
  lg: "size-20 text-lg",
  xl: "size-24 text-xl",
} as const;

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  initials?: string;
  size?: keyof typeof sizeClasses;
}

export function Avatar({
  alt = "",
  className = "",
  initials,
  size = "md",
  src,
  ...props
}: AvatarProps) {
  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#c6ebda] text-[#325347] shadow-[0_10px_20px_-5px_rgba(121,88,65,0.15),inset_0_2px_4px_rgba(255,255,255,0.8)] ring-4 ring-[#abcebf]/30 ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {src ? (
        <Image alt={alt} className="object-cover" fill sizes="96px" src={src} unoptimized />
      ) : (
        <span className="font-['Plus_Jakarta_Sans'] font-medium">{initials || "RH"}</span>
      )}
    </div>
  );
}
