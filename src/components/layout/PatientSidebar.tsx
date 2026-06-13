import Link from "next/link";

export interface PatientSidebarProps {
  activeHref?: string;
  brandName?: string;
  profileLabel?: string;
}

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: "home" },
  { label: "Momo", href: "/momo", icon: "cloud" },
  { label: "Directory", href: "/therapy", icon: "groups" },
  { label: "Vault", href: "/vault", icon: "shield_with_heart" },
];

export function PatientSidebar({
  activeHref = "/dashboard",
  brandName = "Rant & Heal",
  profileLabel = "Your safe space",
}: PatientSidebarProps) {
  return (
    <aside className="hidden h-[calc(100vh-2rem)] w-64 flex-col rounded-[3rem] bg-[#FDFCF8] p-4 font-['Plus_Jakarta_Sans'] text-[#4a6b5e] shadow-[15px_15px_40px_rgba(0,0,0,0.05),-10px_-10px_30px_rgba(255,255,255,0.8)] md:fixed md:left-4 md:top-4 md:z-40 md:flex">
      <div className="mb-10 mt-4 px-4">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-full bg-[#c6ebda] text-[#325347] shadow-[0_10px_20px_-5px_rgba(121,88,65,0.15),inset_0_2px_4px_rgba(255,255,255,0.8)]">
            <span className="text-lg font-extrabold">RH</span>
          </div>
          <div>
            <h2 className="text-xl font-bold leading-none text-emerald-900">{brandName}</h2>
            <p className="mt-1 text-xs font-medium text-[#414845]/70">{profileLabel}</p>
          </div>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-2">
        {navItems.map((item) => {
          const isActive = activeHref === item.href;

          return (
            <Link
              className={`mx-2 flex items-center gap-4 rounded-full px-4 py-3 text-sm font-medium transition-all duration-300 active:scale-95 ${
                isActive
                  ? "bg-[#c6ebda]/50 text-emerald-900 shadow-inner"
                  : "text-emerald-800/60 hover:translate-x-1 hover:bg-emerald-50/50"
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
      <Link
        className="mt-auto flex items-center justify-center gap-2 rounded-full bg-[#325347] px-4 py-4 text-sm font-medium text-white shadow-[0_8px_16px_-4px_rgba(50,83,71,0.2),inset_0_1px_0_rgba(255,255,255,0.4)] active:scale-95"
        href="/momo"
      >
        <span aria-hidden="true" className="material-symbols-outlined">
          add
        </span>
        New Entry
      </Link>
    </aside>
  );
}

