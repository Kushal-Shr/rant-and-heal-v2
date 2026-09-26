import {
  conversationParticipantSchema,
  type ConversationParticipant,
} from "./schemas.ts";

interface ParticipantProfileInput {
  displayName?: unknown;
  isIncognito?: unknown;
  authAnonymous?: boolean;
}

function usableFirstName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const displayName = value.normalize("NFKC").trim();
  if (!displayName || /^(?:anonymous|new patient|patient[-_\s]?\d+)$/i.test(displayName)) {
    return undefined;
  }
  if (displayName.length > 80 || !/^[\p{L}\p{M}][\p{L}\p{M}'’ -]*$/u.test(displayName)) {
    return undefined;
  }
  return displayName.split(/\s+/)[0]?.slice(0, 40) || undefined;
}

export function conversationParticipantFromProfile({
  displayName,
  isIncognito,
  authAnonymous = false,
}: ParticipantProfileInput): ConversationParticipant {
  const preferredName = usableFirstName(displayName);
  const isAnonymous = authAnonymous || isIncognito === true || !preferredName;
  return conversationParticipantSchema.parse({
    isAnonymous,
    ...(!isAnonymous && preferredName ? { preferredName } : {}),
  });
}
