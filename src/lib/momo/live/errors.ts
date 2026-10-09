export interface LiveErrorDetails {
  code?: string;
  message?: string;
  type?: string;
  client_event_id?: string;
  param?: string;
}

export const LIVE_MODERATION_NOTICE =
  "Momo paused that response because it could not be generated safely. The call is still connected—you can keep talking.";

export function isRecoverableLiveModerationStop(error?: LiveErrorDetails): boolean {
  if (!error) return false;
  const code = error.code?.toLowerCase() ?? "";
  const message = error.message?.toLowerCase() ?? "";
  return code.includes("moderation") || code.includes("content_filter") ||
    (message.includes("moderation") && message.includes("generation") && message.includes("stopped"));
}
