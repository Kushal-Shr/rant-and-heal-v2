import { auth } from "../config/firebase";
import type { TherapyMessage, TherapyMessageSenderRole } from "../types/database";

async function messageRequest(path: string, init?: RequestInit) {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in to use therapy chat.");
  const response = await fetch(path, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (response.status === 304) return { notModified: true as const, etag: response.headers.get("ETag") };
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? "Therapy chat is unavailable.");
  return { notModified: false as const, etag: response.headers.get("ETag"), body };
}

export function observeTherapyMessages(relationshipId: string, onChange: (messages: TherapyMessage[]) => void, onError?: (error: Error) => void): () => void {
  let stopped = false;
  let inFlight = false;
  let etag: string | null = null;
  async function poll() {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const result = await messageRequest(`/api/therapy/messages?relationshipId=${encodeURIComponent(relationshipId)}`,
        etag ? { headers: { "If-None-Match": etag } } : undefined);
      if (!stopped && !result.notModified) {
        etag = result.etag;
        onChange(result.body.messages as TherapyMessage[]);
      }
    } catch (error) {
      if (!stopped) onError?.(error instanceof Error ? error : new Error("Therapy chat is unavailable."));
    } finally { inFlight = false; }
  }
  void poll();
  const timer = window.setInterval(() => void poll(), 3000);
  return () => { stopped = true; window.clearInterval(timer); };
}

export async function sendTherapyMessage(relationshipId: string, text: string, senderRole: TherapyMessageSenderRole): Promise<void> {
  void senderRole;
  await messageRequest("/api/therapy/messages", { method: "POST", body: JSON.stringify({ relationshipId, text: text.trim() }) });
}
