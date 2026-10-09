import { getGeminiClient, SAFETY_CLASSIFIER_MODEL } from "@/src/server/momo/gemini";
import { THINKING_LEVELS } from "@/src/lib/ai/models";
import { thinkingConfigFor } from "@/src/server/momo/thinkingConfig";
import {
  modelRiskAssessmentSchema,
  type ModelRiskAssessment,
} from "@/src/lib/safety/schemas";
export type { ModelRiskAssessment } from "@/src/lib/safety/schemas";

export const SAFETY_POLICY_VERSION = "2026-09-25-target-aware-research-draft";
export const DEFAULT_SAFETY_CLASSIFIER_TIMEOUT_MS = 10_000;

const MIN_SAFETY_CLASSIFIER_TIMEOUT_MS = 4_000;
const MAX_SAFETY_CLASSIFIER_TIMEOUT_MS = 30_000;

export function resolveSafetyClassifierTimeoutMs(
  configured = process.env.MOMO_SAFETY_CLASSIFIER_TIMEOUT_MS
): number {
  if (!configured) return DEFAULT_SAFETY_CLASSIFIER_TIMEOUT_MS;

  const timeoutMs = Number(configured);
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < MIN_SAFETY_CLASSIFIER_TIMEOUT_MS ||
    timeoutMs > MAX_SAFETY_CLASSIFIER_TIMEOUT_MS
  ) {
    return DEFAULT_SAFETY_CLASSIFIER_TIMEOUT_MS;
  }
  return timeoutMs;
}

// The model is a second opinion only. Its response is schema-validated and it
// has no tool/function access; application code owns every safety action.
export async function classifySafetyRisk(text: string): Promise<ModelRiskAssessment | null> {
  try {
    const result = await getGeminiClient().models.generateContent({
      model: SAFETY_CLASSIFIER_MODEL,
      contents: [{ role: "user", parts: [{ text }]}],
      config: {
        // Let the SDK abort the underlying request instead of racing a timer
        // that leaves the generation running after this function returns.
        httpOptions: { timeout: resolveSafetyClassifierTimeoutMs() },
        thinkingConfig: thinkingConfigFor(THINKING_LEVELS.SAFETY_CLASSIFIER, SAFETY_CLASSIFIER_MODEL),
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "object",
          properties: {
            level: { type: "string", enum: ["SAFE", "CONCERNING", "IMMINENT"] },
            target: { type: "string", enum: ["NONE", "SELF", "OTHER", "BOTH", "UNCLEAR"] },
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
                  "INTENT",
                ],
              },
              maxItems: 8,
            },
          },
          required: ["level", "target", "category", "evidence"],
          additionalProperties: false,
        },
        systemInstruction: "Classify only explicit safety evidence in the user's current message. Severity and target are separate: target is NONE, SELF, OTHER, BOTH, or UNCLEAR. Sadness, hopelessness, failure, fear, exhaustion, feeling low, uncertainty, anger, or a ruined future are SAFE unless the message also contains personal self-harm, death/nonexistence, suicide, harm-to-others, attempt/injury, plan/access, inability-to-stay-safe, intent, or imminence evidence. Figurative or ambiguous anger is not IMMINENT without supported intent and near-term evidence. Other-directed IMMINENT requires HARM_TO_OTHERS, INTENT, and IMMEDIACY or PLAN_OR_ACCESS evidence. CONCERNING requires supported self-harm, suicidal/death, or harm-to-others evidence without established imminence. Historical, quoted, third-party, fictional, and educational content is SAFE without current personal-risk context. Select only evidence types directly supported by the message. For SELF use category SELF_HARM; for OTHER use HARM_TO_OTHERS; for BOTH or UNCLEAR use category null. SAFE requires target NONE, category null, and an empty evidence array. Return JSON only; do not include rationale, diagnosis, advice, method detail, or external actions.",
      },
    });
    const parsed = modelRiskAssessmentSchema.safeParse(JSON.parse(result.text ?? ""));
    if (!parsed.success) return null;
    return {
      level: parsed.data.level,
      target: parsed.data.target,
      category: parsed.data.category,
      evidence: parsed.data.evidence,
    };
  } catch (error) {
    console.warn("MOMO SAFETY CLASSIFIER UNAVAILABLE:", error);
    return null;
  }
}
