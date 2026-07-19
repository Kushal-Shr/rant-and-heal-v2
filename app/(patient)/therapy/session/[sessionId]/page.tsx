"use client";

import { useParams } from "next/navigation";
import { TherapyCallRoom } from "@/src/components/shared/TherapyCallRoom";
import { useAuth } from "@/src/context/AuthContext";

export default function TherapySessionPage() {
  const { user } = useAuth();
  const params = useParams<{ sessionId: string }>();
  const sessionId = params?.sessionId ?? "";

  if (!user?.uid) {
    return null;
  }

  return <TherapyCallRoom backHref="/therapy" patientUid={user.uid} sessionId={sessionId} />;
}
