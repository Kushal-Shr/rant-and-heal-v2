"use client";

import type { ReactNode, VideoHTMLAttributes } from "react";

export interface VideoContainerProps extends VideoHTMLAttributes<HTMLVideoElement> {
  label: string;
  isMuted?: boolean;
  isLocal?: boolean;
  fallback?: ReactNode;
  actions?: ReactNode;
  videoClassName?: string;
}

export function VideoContainer({
  actions,
  className = "",
  fallback,
  isLocal = false,
  isMuted = false,
  label,
  videoClassName = "",
  ...videoProps
}: VideoContainerProps) {
  return (
    <section
      className={`relative overflow-hidden rounded-[2.5rem] bg-[#fff1e8] shadow-[0_20px_40px_-15px_rgba(121,88,65,0.15),0_10px_20px_-10px_rgba(121,88,65,0.1)] ${className}`}
    >
      <div className="aspect-video bg-[#2c1601]/90">
        {fallback ? (
          <div className="flex size-full items-center justify-center bg-[#c6ebda]/30 text-[#325347]">
            {fallback}
          </div>
        ) : (
          <video
            autoPlay
            className={`size-full object-cover ${isLocal ? "-scale-x-100" : ""} ${videoClassName}`}
            muted={isMuted}
            playsInline
            {...videoProps}
          />
        )}
      </div>
      <div className="absolute inset-x-4 bottom-4 flex items-center justify-between gap-4 rounded-full bg-[#fff8f5]/85 px-4 py-3 font-['Plus_Jakarta_Sans'] shadow-[inset_0_2px_6px_rgba(44,22,1,0.08)] backdrop-blur-md">
        <span className="truncate text-sm font-medium text-[#2c1601]">{label}</span>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
    </section>
  );
}

