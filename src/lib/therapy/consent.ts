export const THERAPY_CONSENT_VERSION = "2026-09-21-ai-notes";

export const THERAPY_CONSENT_DISCLOSURE =
  "I consent to share my chosen display name, therapy messages, call activity, and connection status with this therapist until I end the connection. Therapy messages may be securely processed by Rant & Heal's AI to create draft session summaries and weekly reflections. AI-generated session notes are reviewed by my therapist before they are used as reviewed therapy notes.";

export const THERAPY_CONSENT_SCOPE = [
  "shared-profile",
  "therapy-messages",
  "therapy-calls",
  "connection-status",
  "ai-session-note-drafts",
  "weekly-reflections",
] as const;

export const CALL_TRANSCRIPTION_CONSENT_DISCLOSURE =
  "This call may be transcribed to help create session notes. Both you and your therapist must consent before transcription begins.";
