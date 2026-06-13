import Link from "next/link";
import { MarketingNavbar } from "@/src/components/layout/MarketingNavbar";
import { MarketingFooter } from "@/src/components/layout/MarketingFooter";
import { Button } from "@/src/components/ui/Button";
import { Card } from "@/src/components/ui/Card";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#fff8f5] text-[#2c1601] font-['Plus_Jakarta_Sans']">
      <MarketingNavbar />

      <main className="flex-1 flex flex-col items-center justify-center max-w-6xl mx-auto px-6 py-20 text-center">
        {/* Hero Section */}
        <section className="mb-20">
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-[#325347] uppercase leading-[1.1] mb-6">
            YOUR MIND.<br />YOUR VAULT.<br />YOUR RULES.
          </h1>
          <p className="text-lg md:text-xl text-[#414845] max-w-2xl mx-auto mb-10 leading-relaxed">
            Welcome to a secure sanctuary for mental well-being. Experience empathetic 24/7 AI-guided support paired with private, end-to-end encrypted clinical therapy.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link href="/auth/signup?role=PATIENT" className="w-full sm:w-auto">
              <Button size="lg" variant="primary" className="w-full uppercase tracking-wider">
                GET STARTED AS A PATIENT
              </Button>
            </Link>
            <Link href="/auth/signup?role=THERAPIST" className="w-full sm:w-auto">
              <Button size="lg" variant="secondary" className="w-full uppercase tracking-wider">
                JOIN AS A PRACTITIONER
              </Button>
            </Link>
          </div>
        </section>

        {/* Feature Highlights */}
        <section className="w-full px-4 mb-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card variant="solid" className="flex flex-col items-center text-center p-8">
              <div className="size-16 rounded-full bg-[#c6ebda]/50 flex items-center justify-center text-3xl mb-6 shadow-sm">
                💬
              </div>
              <h3 className="text-2xl font-bold mb-3 text-[#325347]">AI Momo</h3>
              <p className="text-base text-[#414845] leading-relaxed">
                Your 24/7 empathetic digital companion. Safe, instant, conversational triage to help you unpack thoughts whenever you need.
              </p>
            </Card>

            <Card variant="solid" className="flex flex-col items-center text-center p-8">
              <div className="size-16 rounded-full bg-[#ffeada] flex items-center justify-center text-3xl mb-6 shadow-sm">
                🔒
              </div>
              <h3 className="text-2xl font-bold mb-3 text-[#325347]">Zero-Trust Vault</h3>
              <p className="text-base text-[#414845] leading-relaxed">
                Complete data autonomy. Write your journal entries inside a secure sandbox where only you control access keys.
              </p>
            </Card>

            <Card variant="solid" className="flex flex-col items-center text-center p-8">
              <div className="size-16 rounded-full bg-[#fff1e8] border border-[#ffeada] flex items-center justify-center text-3xl mb-6 shadow-sm">
                🤝
              </div>
              <h3 className="text-2xl font-bold mb-3 text-[#325347]">Verified Therapy</h3>
              <p className="text-base text-[#414845] leading-relaxed">
                Connect directly with licensed clinicians. Access safe digital chat rooms and high-fidelity video session suites.
              </p>
            </Card>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
