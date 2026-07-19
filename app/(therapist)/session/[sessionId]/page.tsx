"use client";

import { useParams, useSearchParams } from "next/navigation";
import { TherapyCallRoom } from "@/src/components/shared/TherapyCallRoom";
import { Spinner } from "@/src/components/ui/Spinner";
import { useAuth } from "@/src/context/AuthContext";

export default function TherapistSessionPage() {
  const { user } = useAuth();
  const params = useParams<{ sessionId: string }>();
  const searchParams = useSearchParams();
  const sessionId = params?.sessionId ?? "";
  const patientUid = searchParams?.get("patientId") ?? "";

  if (!user?.uid) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Spinner label="Resolving call" />
      </div>
    );
  }

  if (!patientUid) {
    return <p className="border-2 border-[#2c1601] bg-[#ffdad6] p-5 font-black text-[#93000a]">Call session needs a patientId. Start calls from the patient roster.</p>;
  }

  return <TherapyCallRoom backHref="/patients" patientUid={patientUid} sessionId={sessionId} />;
}
