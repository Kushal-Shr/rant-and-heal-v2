"use client";

import { Avatar } from "../ui/Avatar";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";

export interface TherapistProfileCardProps {
  name: string;
  title: string;
  bio: string;
  specialties: string[];
  imageSrc?: string;
  rating?: number;
  reviewCount?: number;
  ctaLabel?: string;
  onConnect?: () => void;
}

export function TherapistProfileCard({
  bio,
  ctaLabel = "Connect Now",
  imageSrc,
  name,
  onConnect,
  rating,
  reviewCount,
  specialties,
  title,
}: TherapistProfileCardProps) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <article className="flex h-full flex-col rounded-[2.5rem] bg-white p-10 text-[#2c1601] shadow-[0_20px_40px_-10px_rgba(121,88,65,0.1),0_10px_15px_-5px_rgba(121,88,65,0.05),inset_0_2px_4px_rgba(255,255,255,0.8)]">
      <div className="mb-6 flex items-start gap-6">
        <Avatar alt={name} initials={initials} size="lg" src={imageSrc} />
        <div>
          <h3 className="font-['Plus_Jakarta_Sans'] text-2xl font-medium leading-[1.4] text-[#2c1601]">
            {name}
          </h3>
          <p className="font-['Plus_Jakarta_Sans'] text-sm font-medium leading-[1.2] tracking-[0.01em] text-[#4a6b5e]">
            {title}
          </p>
          {typeof rating === "number" ? (
            <p className="mt-2 text-xs font-medium text-[#414845]">
              {rating.toFixed(1)}
              {reviewCount ? ` (${reviewCount} reviews)` : ""}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        {specialties.map((specialty) => (
          <Badge key={specialty}>{specialty}</Badge>
        ))}
      </div>
      <p className="mb-10 flex-1 font-['Plus_Jakarta_Sans'] text-base font-light leading-[1.6] text-[#414845]">
        {bio}
      </p>
      <Button className="w-full" onClick={onConnect} variant="outline">
        {ctaLabel}
      </Button>
    </article>
  );
}

