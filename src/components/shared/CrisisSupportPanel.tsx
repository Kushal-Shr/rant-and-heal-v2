const configuredContactName = process.env.NEXT_PUBLIC_CRISIS_CONTACT_NAME?.trim();
const configuredContactPhone = process.env.NEXT_PUBLIC_CRISIS_CONTACT_PHONE?.trim();
const dialableContactPhone = configuredContactPhone?.replace(/[^+\d]/g, "");

interface CrisisSupportPanelProps {
  onClose?: () => void;
}

export function CrisisSupportPanel({ onClose }: CrisisSupportPanelProps) {
  return (
    <section aria-labelledby="crisis-support-heading" className="border-4 border-black bg-[#fff8f5] p-6 text-[#2c1601] shadow-[8px_8px_0_0_#000000] sm:p-8">
      <p className="font-['Plus_Jakarta_Sans'] text-xs font-black uppercase tracking-[0.24em] text-red-700">
        Crisis support
      </p>
      <h1 id="crisis-support-heading" className="mt-3 font-['Plus_Jakarta_Sans'] text-3xl font-black uppercase leading-tight sm:text-4xl">
        Your safety comes first.
      </h1>
      <p className="mt-5 max-w-2xl font-['Plus_Jakarta_Sans'] text-base font-semibold leading-7">
        If you may hurt yourself or someone else, call your local emergency services now or go to the nearest emergency department. If you can, contact someone you trust and stay near other people.
      </p>

      {dialableContactPhone ? (
        <a
          className="mt-6 block border-4 border-black bg-red-600 px-5 py-4 text-center font-['Plus_Jakarta_Sans'] text-base font-black uppercase tracking-[0.12em] text-white shadow-[5px_5px_0_0_#000000] transition-transform hover:translate-y-1 hover:shadow-none"
          href={`tel:${dialableContactPhone}`}
        >
          Call {configuredContactName || "support contact"}: {configuredContactPhone}
        </a>
      ) : (
        <div className="mt-6 border-4 border-black bg-[#fff1b8] p-4 font-['Plus_Jakarta_Sans'] text-sm font-bold leading-6">
          A dedicated crisis contact has not been configured yet. Use your local emergency number or go to the nearest emergency department.
        </div>
      )}

      <p className="mt-5 font-['Plus_Jakarta_Sans'] text-sm leading-6 text-[#5f5147]">
        Rant &amp; Heal and Momo are not emergency services and cannot provide crisis intervention.
      </p>

      {onClose ? (
        <button
          className="mt-6 border-4 border-black bg-white px-5 py-3 font-['Plus_Jakarta_Sans'] text-sm font-black uppercase tracking-[0.12em] shadow-[4px_4px_0_0_#000000] transition-transform hover:translate-y-1 hover:shadow-none"
          onClick={onClose}
          type="button"
        >
          Close
        </button>
      ) : null}
    </section>
  );
}
