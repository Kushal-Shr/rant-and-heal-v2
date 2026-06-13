import Link from "next/link";

export interface MarketingFooterLink {
  label: string;
  href: string;
}

export interface MarketingFooterProps {
  brandName?: string;
  links?: MarketingFooterLink[];
}

const defaultLinks: MarketingFooterLink[] = [
  { label: "Privacy", href: "/privacy" },
  { label: "Crisis Support", href: "/crisis" },
  { label: "Sign In", href: "/auth/login" },
];

export function MarketingFooter({
  brandName = "Rant & Heal",
  links = defaultLinks,
}: MarketingFooterProps) {
  return (
    <footer className="bg-[#fff8f5] px-6 py-10 font-['Plus_Jakarta_Sans'] text-[#414845]">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 rounded-[2.5rem] bg-white/60 p-6 shadow-[0_10px_30px_-15px_rgba(74,107,94,0.1),inset_0_2px_4px_rgba(255,255,255,0.5)] backdrop-blur-xl md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xl font-extrabold italic text-[#4a6b5e]">{brandName}</p>
          <p className="mt-1 text-xs font-medium">Softly healing, one breath at a time.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {links.map((link) => (
            <Link
              className="rounded-full px-4 py-2 text-sm font-medium transition-colors hover:bg-[#c6ebda]/30 hover:text-[#325347]"
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}

