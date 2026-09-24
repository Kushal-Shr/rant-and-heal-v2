import { MOMO_BOUNDARIES_PROMPT } from "@/src/lib/momo/prompts/boundaries";
import { MOMO_CORE_PROMPT } from "@/src/lib/momo/prompts/core";
import { MOMO_PCT_PROMPT } from "@/src/lib/momo/prompts/pct";

export const MOMO_SYSTEM_INSTRUCTION = [
  MOMO_CORE_PROMPT,
  MOMO_PCT_PROMPT,
  MOMO_BOUNDARIES_PROMPT,
].join("\n\n");
