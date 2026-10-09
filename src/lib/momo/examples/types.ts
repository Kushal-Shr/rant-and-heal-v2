import type { SupportMode } from "../schemas.ts";

export interface MomoExample {
  id: string;
  tags: string[];
  mode: SupportMode;
  context: string;
  knownFacts: string[];
  unknownFacts: string[];
  principles: string[];
  avoid: string[];
  turns: Array<{ user: string; momo: string }>;
}
