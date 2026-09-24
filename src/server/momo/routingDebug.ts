import type { MomoDecision } from "../../lib/momo/schemas.ts";
import type { SafetyState } from "../../lib/safety/schemas.ts";

interface RoutingDebugEnvironment {
  NODE_ENV?: string;
  MOMO_DEBUG_ROUTING?: string;
}

interface RoutingDebugOptions {
  environment?: RoutingDebugEnvironment;
  log?: (label: string, metadata: Record<string, unknown>) => void;
}

function isRoutingDebugEnabled(environment: RoutingDebugEnvironment): boolean {
  return environment.NODE_ENV === "development" &&
    environment.MOMO_DEBUG_ROUTING === "true";
}

export function routingDebugMetadata(decision: MomoDecision): Record<string, unknown> {
  return {
    supportMode: decision.supportMode,
    primaryNeed: decision.primaryNeed,
    intervention: decision.intervention,
    confidence: decision.confidence,
    shouldClarify: decision.shouldClarify,
    clarificationTarget: decision.clarificationTarget ?? null,
    userPreferenceOverride: decision.userPreferenceOverride,
    safetyState: decision.safetyState,
  };
}

export function logMomoRoutingDecision(
  decision: MomoDecision,
  options: RoutingDebugOptions = {}
): boolean {
  const environment = options.environment ?? process.env;
  if (!isRoutingDebugEnabled(environment)) return false;

  const log = options.log ?? console.info;
  log("MOMO ROUTING", routingDebugMetadata(decision));
  return true;
}

export function logMomoSafetyBypass(
  safetyState: SafetyState,
  options: RoutingDebugOptions = {}
): boolean {
  const environment = options.environment ?? process.env;
  if (!isRoutingDebugEnabled(environment)) return false;

  const log = options.log ?? console.info;
  log("MOMO ROUTING", { safetyState, bypassedNormalPlanner: true });
  return true;
}
