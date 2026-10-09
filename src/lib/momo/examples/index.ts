import { listeningExamples } from "./listening.ts";
import { workThroughExamples } from "./workThrough.ts";
import { directHelpExamples } from "./directHelp.ts";
import { regulationExamples } from "./regulation.ts";
import { continuityExamples } from "./continuity.ts";
import { multilingualExamples } from "./multilingual.ts";
import { safetyExamples } from "./safety.ts";
import type { MomoExample } from "./types.ts";

export const MOMO_EXAMPLES: readonly MomoExample[] = [
  ...listeningExamples, ...workThroughExamples, ...directHelpExamples,
  ...regulationExamples, ...continuityExamples, ...multilingualExamples, ...safetyExamples,
];
export type { MomoExample } from "./types.ts";
