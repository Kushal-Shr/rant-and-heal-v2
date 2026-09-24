import Image from "next/image";

export function MomoPortrait({ className = "", priority = false, animated = false }: {
  className?: string; priority?: boolean; animated?: boolean;
}) {
  return (
    <div aria-hidden="true" className={`momo-portrait ${animated ? "momo-float" : ""} ${className}`}>
      <Image alt="" src="/images/momo-dumpling-clay-transparent.png" width={512} height={512} priority={priority}
        sizes="(max-width: 640px) 208px, 288px" className="h-full w-full scale-[1.16] object-cover" />
    </div>
  );
}
