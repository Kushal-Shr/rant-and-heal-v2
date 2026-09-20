"use client";

import { useEffect, useState } from "react";
import { observePatientConnection } from "@/src/services/connectionService";
import type { Connection } from "@/src/types/database";

export function usePatientConnection(patientId: string) {
  const [result, setResult] = useState<{
    patientId: string;
    connection: Connection | null;
    error: boolean;
  } | null>(null);
  useEffect(() => {
    if (!patientId) return;
    return observePatientConnection(patientId, (value) => {
      setResult({ patientId, connection: value, error: false });
    }, () => {
      setResult({ patientId, connection: null, error: true });
    });
  }, [patientId]);
  const current = result?.patientId === patientId ? result : null;
  return {
    connection: current?.connection ?? null,
    loading: Boolean(patientId && !current),
    error: current?.error ?? false,
  };
}
