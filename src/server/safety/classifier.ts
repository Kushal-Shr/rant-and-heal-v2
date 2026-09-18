import { z } from "zod";
import { getGeminiClient, MOMO_TEXT_MODEL } from "@/src/server/momo/gemini";

export const SAFETY_POLICY_VERSION = "2026-09-17-v1";

export interface ModelRiskAssessment {
  level: "SAFE" | "CONCERNING" | "IMMINENT";
  category?: "SELF_HARM" | "HARM_TO_OTHERS";
  rationale: string;
}

const modelAssessmentSchema = z.object({
  level: z.enum(["SAFE", "CONCERNING", "IMMINENT"]),
  category: z.enum(["SELF_HARM", "HARM_TO_OTHERS"]).nullable(),
  rationale: z.string().min(1).max(240),
});

// The model is a second opinion only. Its response is schema-validated and it
// has no tool/function access; application code owns every safety action.
export async function classifySafetyRisk(text: string): Promise<ModelRiskAssessment | null> {
  try {
    const result = await getGeminiClient().models.generateContent({
      model: MOMO_TEXT_MODEL,
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
    const parsed = modelAssessmentSchema.safeParse(JSON.parse(result.text ?? ""));
    if (!parsed.success) return null;
    return {
      level: parsed.data.level,
      category: parsed.data.category ?? undefined,
      rationale: parsed.data.rationale,
    };
  } catch (error) {
    console.warn("MOMO SAFETY CLASSIFIER UNAVAILABLE:", error);
    return null;
  }
}
