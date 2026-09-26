import type { Content } from "@google/genai";
import { composeMomoSystemInstruction } from "@/src/lib/momo/responder";
import { continuityResponseViolations } from "@/src/lib/momo/continuity";
import type { MomoDecision, NormalizedConversationInput } from "@/src/lib/momo/schemas";
import { enforceBackendActionTruthfulness } from "@/src/lib/safety/actionTruthfulness";
import { getGeminiClient, MOMO_TEXT_MODEL } from "./gemini";
import { MOMO_SYSTEM_INSTRUCTION } from "./persona";

export async function generateMomoResponse(
  input: NormalizedConversationInput,
  decision: MomoDecision
): Promise<string> {
  const contents: Content[] = [
    ...input.history.map((turn) => ({
      role: turn.role === "MOMO" ? "model" : "user",
      parts: [{ text: turn.text }],
    })),
    { role: "user", parts: [{ text: input.messageText }] },
  ];
  const baseSystemInstruction = composeMomoSystemInstruction(MOMO_SYSTEM_INSTRUCTION, decision, {
    conversationModality: "TEXT",
    continuityState: input.continuityState,
    participant: input.participant,
  });
  let retryInstruction = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await getGeminiClient().models.generateContent({
      model: MOMO_TEXT_MODEL,
      contents,
      config: {
        systemInstruction: retryInstruction
          ? `${baseSystemInstruction}\n\n${retryInstruction}`
          : baseSystemInstruction,
      },
    });
    const reply = result.text?.trim();
    if (!reply) throw new Error("Gemini returned an empty response.");
    const truthfulReply = enforceBackendActionTruthfulness(reply);
    const violations = continuityResponseViolations(
      truthfulReply,
      input,
      input.continuityState
    );
    if (violations.length === 0) return truthfulReply;
    retryInstruction = `Rewrite the answer because it violated these conversation-continuity constraints: ${violations.join(", ")}. Keep the same helpful intent, but obey the bounded continuity state. Do not explain the rewrite or mention internal policy.`;
  }
  throw new Error("Gemini could not produce a continuity-safe response.");
}
