import Link from "next/link";

export interface TherapistSidebarProps {
  activeHref?: string;
  brandName?: string;
  profileLabel?: string;
}

const navItems = [
  { label: "Portal", href: "/portal", icon: "dashboard" },
  { label: "Patients", href: "/patients", icon: "groups" },
  { label: "Messages", href: "/messages", icon: "chat_bubble" },
];

export function TherapistSidebar({
  activeHref = "/portal",
  brandName = "Rant & Heal",
  profileLabel = "Therapist portal",
}: TherapistSidebarProps) {
  return (
    <aside className="hidden h-[calc(100vh-2rem)] w-[260px] flex-col overflow-hidden rounded-[2rem] bg-white px-2 py-6 font-['Plus_Jakarta_Sans'] text-[#325347] shadow-[0_15px_40px_-10px_rgba(74,107,94,0.2)] md:fixed md:left-4 md:top-4 md:z-40 md:flex">
      <div className="mb-8 flex flex-col items-center px-6 text-center">
        <div className="mb-4 flex size-20 items-center justify-center rounded-full bg-[#c6ebda] text-[#325347] shadow-[0_20px_40px_-15px_rgba(121,88,65,0.15),0_10px_20px_-10px_rgba(121,88,65,0.1)]">
          <span className="text-2xl font-extrabold">RH</span>
        </div>
        <h2 className="text-xl font-extrabold">{brandName}</h2>
        <p className="text-xs font-medium text-[#717974]">{profileLabel}</p>
      </div>
      <nav className="flex flex-1 flex-col gap-2">
        {navItems.map((item) => {
          const isActive = activeHref === item.href;

          return (
            <Link
              className={`mx-2 flex items-center gap-3 rounded-full px-4 py-3 text-sm font-medium transition-all active:scale-95 ${
                isActive
                  ? "bg-[#325347] text-white shadow-[0_8px_16px_-4px_rgba(50,83,71,0.2),inset_0_1px_0_rgba(255,255,255,0.4)]"
                  : "text-[#414845] hover:bg-[#c6ebda]/30 hover:text-[#325347]"
              }`}
              href={item.href}
              key={item.href}
            >
              <span aria-hidden="true" className="material-symbols-outlined">
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mx-4 border-t border-[#ffdcbf] pt-4">
        <Link
          className="flex items-center justify-center gap-2 rounded-full bg-[#ffdad6] px-4 py-3 text-sm font-medium text-[#93000a] shadow-[0_8px_16px_-4px_rgba(186,26,26,0.16)] active:scale-95"
          href="/crisis"
        >
          <span aria-hidden="true" className="material-symbols-outlined">
            emergency
          </span>
          Crisis Support
        </Link>
      </div>
    </aside>
  );
}

