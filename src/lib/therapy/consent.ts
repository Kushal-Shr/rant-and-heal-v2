export const THERAPY_CONSENT_VERSION = "2026-09-19";

export const THERAPY_CONSENT_DISCLOSURE =
  "I consent to share my chosen display name, therapy messages, call activity, and connection status with this therapist until I end the connection.";

export const THERAPY_CONSENT_SCOPE = [
  "shared-profile",
  "therapy-messages",
  "therapy-calls",
  "connection-status",
] as const;
