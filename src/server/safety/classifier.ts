import { getGeminiClient, SAFETY_CLASSIFIER_MODEL } from "@/src/server/momo/gemini";
import {
  modelRiskAssessmentSchema,
  type ModelRiskAssessment,
} from "@/src/lib/safety/schemas";
export type { ModelRiskAssessment } from "@/src/lib/safety/schemas";

export const SAFETY_POLICY_VERSION = "2026-09-17-v1";

// The model is a second opinion only. Its response is schema-validated and it
// has no tool/function access; application code owns every safety action.
export async function classifySafetyRisk(text: string): Promise<ModelRiskAssessment | null> {
  try {
    const generation = getGeminiClient().models.generateContent({
      model: SAFETY_CLASSIFIER_MODEL,
      contents: [{ role: "user", parts: [{ text }]}],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "object",
          properties: {
            level: { type: "string", enum: ["SAFE", "CONCERNING", "IMMINENT"] },
            category: { type: ["string", "null"], enum: ["SELF_HARM", "HARM_TO_OTHERS", null] },
            rationale: { type: "string" },
          },
          required: ["level", "category", "rationale"],
          additionalProperties: false,
        },
        systemInstruction: "Classify only the immediate risk in the user's message. Do not diagnose or offer advice. IMMINENT means direct, credible current intent to harm self or others. CONCERNING means distress or ideation without clear imminent intent. SAFE means neither. Return JSON only.",
      },
    });
    const result = await Promise.race([
      generation,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Safety classifier timed out")), 4_000)
      ),
    ]);
    const parsed = modelRiskAssessmentSchema.safeParse(JSON.parse(result.text ?? ""));
    if (!parsed.success) return null;
    return {
      level: parsed.data.level,
      category: parsed.data.category,
      rationale: parsed.data.rationale,
    };
  } catch (error) {
    console.warn("MOMO SAFETY CLASSIFIER UNAVAILABLE:", error);
    return null;
  }
}
