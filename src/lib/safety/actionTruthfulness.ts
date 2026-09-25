import type { ExternalActionStatus } from "./schemas.ts";

export type ExternalAction =
  | "EMERGENCY_CONTACT"
  | "THERAPIST_HANDOFF"
  | "AMBULANCE"
  | "POLICE"
  | "HOTLINE";

export type ExternalActionStates = Partial<Record<ExternalAction, ExternalActionStatus>>;

const CLAIMS: Array<{
  action: ExternalAction;
  allowed: ExternalActionStatus[];
  expression: RegExp;
}> = [
  { action: "EMERGENCY_CONTACT", allowed: ["CONFIRMED"], expression: /\b(?:your\s+)?emergency contact has been notified\b[.!]?/gi },
  { action: "THERAPIST_HANDOFF", allowed: ["CONFIRMED"], expression: /\b(?:a|your) therapist is joining\b[.!]?/gi },
  { action: "AMBULANCE", allowed: ["CONFIRMED"], expression: /\b(?:the\s+)?ambulance is (?:coming|on (?:its|the) way)\b[.!]?/gi },
  { action: "POLICE", allowed: ["CONFIRMED"], expression: /\b(?:the\s+)?police have been contacted\b[.!]?/gi },
  { action: "HOTLINE", allowed: ["CONFIRMED"], expression: /\byou are (?:now )?connected to (?:the|a) hotline\b[.!]?/gi },
  { action: "HOTLINE", allowed: ["STARTED", "CONFIRMED"], expression: /\bi(?:['’]m| am) starting the (?:hotline )?connection now\b[.!]?/gi },
];

/**
 * Removes success/progress claims that are not backed by application state.
 * The response model never gets to authorize an external action by wording it.
 */
export function enforceBackendActionTruthfulness(
  response: string,
  actionStates: ExternalActionStates = {}
): string {
  let cleaned = response;
  let removedClaim = false;

  for (const claim of CLAIMS) {
    const status = actionStates[claim.action];
    if (status && claim.allowed.includes(status)) continue;
    cleaned = cleaned.replace(claim.expression, () => {
      removedClaim = true;
      return "";
    });
  }

  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
  if (!removedClaim) return cleaned;
  const disclosure = "I can’t confirm that any external service or person has been contacted.";
  return cleaned ? `${cleaned}\n\n${disclosure}` : disclosure;
}
