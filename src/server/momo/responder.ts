import type { Content } from "@google/genai";
import { composeMomoSystemInstruction } from "@/src/lib/momo/responder";
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
  const result = await getGeminiClient().models.generateContent({
    model: MOMO_TEXT_MODEL,
    contents,
    config: {
      systemInstruction: composeMomoSystemInstruction(MOMO_SYSTEM_INSTRUCTION, decision),
    },
  });
  const reply = result.text?.trim();
  if (!reply) throw new Error("Gemini returned an empty response.");
  return enforceBackendActionTruthfulness(reply);
}
