import OpenAI from "openai";
import { getRequiredEnv } from "./gemini";

let client: OpenAI | undefined;

export function getOpenAIClient(): OpenAI {
  client ??= new OpenAI({
    apiKey: getRequiredEnv("OPENAI_API_KEY"),
  });
  return client;
}
