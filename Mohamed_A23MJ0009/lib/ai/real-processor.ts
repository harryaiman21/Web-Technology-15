import type { AiDraftResult } from "./types";

export async function realProcess(text: string): Promise<AiDraftResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const prompt = `You are a logistics knowledge base assistant for DHL operations.
Given the following raw operational text, produce a structured knowledge article.

Return ONLY valid JSON with this exact shape:
{
  "title": "short descriptive title",
  "summary": "2-3 sentence summary",
  "steps": ["step 1 text", "step 2 text", ...],
  "tags": ["tag1", "tag2", ...]
}

Rules:
- Title: concise, under 100 chars
- Summary: 2-3 sentences max
- Steps: clear actionable instructions, 3-15 steps
- Tags: 3-8 relevant logistics keywords

Raw text:
${text.slice(0, 4000)}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from OpenAI");

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Could not parse JSON from OpenAI response");

  return JSON.parse(jsonMatch[0]) as AiDraftResult;
}
