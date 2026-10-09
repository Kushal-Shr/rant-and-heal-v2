import { ThinkingLevel, type ThinkingConfig } from "@google/genai";

export function thinkingConfigFor(level: string, model: string): ThinkingConfig {
  if (/gemini-2\.5/i.test(model)) {
    return { thinkingBudget: level === "high" ? 4_096 : level === "medium" ? 2_048 : 512 };
  }
  return {
    thinkingLevel: level === "high" ? ThinkingLevel.HIGH : level === "medium" ? ThinkingLevel.MEDIUM : ThinkingLevel.LOW,
  };
}
