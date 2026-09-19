const configuredContactName = process.env.NEXT_PUBLIC_CRISIS_CONTACT_NAME?.trim();
const configuredContactPhone = process.env.NEXT_PUBLIC_CRISIS_CONTACT_PHONE?.trim();
const dialableContactPhone = configuredContactPhone?.replace(/[^+\d]/g, "");

interface CrisisSupportPanelProps {
  onClose?: () => void;
}

export function CrisisSupportPanel({ onClose }: CrisisSupportPanelProps) {
  return (
    <section aria-labelledby="crisis-support-heading" className="rounded-[2.5rem] border border-white/80 bg-[#fff8f5] p-6 text-[#2c1601] shadow-[0_24px_48px_-22px_rgba(186,26,26,0.22),inset_0_2px_5px_rgba(255,255,255,0.85)] sm:p-8">
      <p className="font-['Plus_Jakarta_Sans'] text-xs font-medium uppercase tracking-[0.18em] text-[#93000a]">
        Crisis support
      </p>
      <h1 id="crisis-support-heading" className="mt-3 font-['Plus_Jakarta_Sans'] text-3xl font-medium leading-tight tracking-[-0.03em] sm:text-4xl">
        Your safety comes first.
      </h1>
      <p className="mt-5 max-w-2xl font-['Plus_Jakarta_Sans'] text-base font-light leading-7">
        If you may hurt yourself or someone else, call your local emergency services now or go to the nearest emergency department. If you can, contact someone you trust and stay near other people.
      </p>

      {dialableContactPhone ? (
        <a
          className="mt-6 block rounded-full bg-[#ba1a1a] px-5 py-4 text-center font-['Plus_Jakarta_Sans'] text-base font-medium text-white shadow-[0_10px_20px_-8px_rgba(186,26,26,0.45),inset_0_1px_0_rgba(255,255,255,0.35)] transition-transform hover:bg-[#93000a] active:scale-95"
          href={`tel:${dialableContactPhone}`}
        >
          Call {configuredContactName || "support contact"}: {configuredContactPhone}
        </a>
      ) : (
        <div className="mt-6 rounded-[1.5rem] bg-[#ffe3cd] p-4 font-['Plus_Jakarta_Sans'] text-sm font-light leading-6 text-[#795841]">
          A dedicated crisis contact has not been configured yet. Use your local emergency number or go to the nearest emergency department.
        </div>
      )}

      <p className="mt-5 font-['Plus_Jakarta_Sans'] text-sm leading-6 text-[#5f5147]">
        Rant &amp; Heal and Momo are not emergency services and cannot provide crisis intervention.
      </p>

      {onClose ? (
        <button
          className="mt-6 rounded-full bg-white px-5 py-3 font-['Plus_Jakarta_Sans'] text-sm font-medium text-[#325347] shadow-[0_8px_16px_-8px_rgba(74,107,94,0.22)] transition-transform hover:bg-[#fff1e8] active:scale-95"
          onClick={onClose}
          type="button"
        >
          Close
        </button>
      ) : null}
    </section>
  );
}
