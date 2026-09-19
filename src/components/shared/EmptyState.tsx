import Link from "next/link";

export function EmptyState({ icon, title, description, href, action }: {
  icon: string; title: string; description: string; href?: string; action?: string;
}) {
  return (
    <div className="clay-card flex flex-col items-center px-6 py-12 text-center">
      <span aria-hidden="true" className="clay-icon mb-5 material-symbols-outlined">{icon}</span>
      <h2 className="text-xl font-medium text-[#325347]">{title}</h2>
      <p className="mt-3 max-w-md text-sm font-light leading-7 text-[#414845]">{description}</p>
      {href && action ? <Link className="clay-link mt-6" href={href}>{action}<span aria-hidden="true"> →</span></Link> : null}
    </div>
  );
}
