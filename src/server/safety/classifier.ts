import { getGeminiClient, SAFETY_CLASSIFIER_MODEL } from "@/src/server/momo/gemini";
import {
  modelRiskAssessmentSchema,
  type ModelRiskAssessment,
} from "@/src/lib/safety/schemas";
export type { ModelRiskAssessment } from "@/src/lib/safety/schemas";

export const SAFETY_POLICY_VERSION = "2026-09-24-day3-research-draft";

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
            evidence: {
              type: "array",
              items: {
                type: "string",
                enum: [
                  "SELF_DIRECTED_HARM",
                  "DEATH_OR_NONEXISTENCE",
                  "SUICIDAL_IDEATION",
                  "PLAN_OR_ACCESS",
                  "IMMEDIACY",
                  "INABILITY_TO_STAY_SAFE",
                  "ATTEMPT_OR_INJURY",
                  "HARM_TO_OTHERS",
                ],
              },
              maxItems: 8,
            },
          },
          required: ["level", "category", "evidence"],
          additionalProperties: false,
        },
        systemInstruction: "Classify only explicit safety evidence in the user's current message. Sadness, hopelessness, failure, fear, exhaustion, feeling low, uncertainty, or a ruined future are SAFE unless the message also contains personal self-harm, death/nonexistence, suicide, harm-to-others, attempt/injury, plan/access, inability-to-stay-safe, or imminence evidence. IMMINENT requires supported intent to act now or soon, inability to stay safe, a plan/access signal, an attempt underway, or serious injury. CONCERNING requires supported self-harm, suicidal/death, or harm-to-others evidence without established immediacy. Historical, quoted, third-party, and educational content is SAFE without current personal-risk context. Select only evidence types directly supported by the message. SAFE requires category null and an empty evidence array. Return JSON only; do not include rationale, diagnosis, advice, method detail, or external actions.",
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
      evidence: parsed.data.evidence,
    };
  } catch (error) {
    console.warn("MOMO SAFETY CLASSIFIER UNAVAILABLE:", error);
    return null;
  }
}
