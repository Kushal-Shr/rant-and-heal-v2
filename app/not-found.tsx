import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <section className="clay-card max-w-lg p-8 text-center">
        <span aria-hidden="true" className="material-symbols-outlined text-4xl text-[#795841]">explore_off</span>
        <h1 className="mt-4 text-3xl font-medium text-[#325347]">We couldn’t find that page</h1>
        <p className="mt-3 text-sm leading-6 text-[#414845]">The link may be old, or the page may have moved.</p>
        <Link className="clay-link mt-6 inline-flex" href="/">Return home</Link>
      </section>
    </div>
  );
}
