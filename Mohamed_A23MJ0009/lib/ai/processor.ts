import type { AiDraftResult } from "./types";
import { fallbackProcess } from "./fallback-processor";
import { realProcess } from "./real-processor";

export async function generateDraft(text: string): Promise<AiDraftResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey && apiKey.trim().length > 0) {
    try {
      return await realProcess(text);
    } catch {
      // Fall back to deterministic processor if API fails
      return fallbackProcess(text);
    }
  }

  return fallbackProcess(text);
}
