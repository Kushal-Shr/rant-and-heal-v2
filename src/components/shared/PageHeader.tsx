import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, children, tone = "sage" }: {
  eyebrow: string; title: string; description: string; children?: ReactNode; tone?: "sage" | "peach";
}) {
  return (
    <header className={`clay-page-header clay-page-header--${tone}`}>
      <div className="relative max-w-2xl">
        <p className="clay-eyebrow">{eyebrow}</p>
        <h1 className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-3 max-w-xl text-sm font-light leading-7 sm:text-base">{description}</p>
      </div>
      {children ? <div className="relative shrink-0">{children}</div> : null}
    </header>
  );
}
