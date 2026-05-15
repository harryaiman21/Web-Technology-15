import { getAIClient, getModel, IS_OPENAI_COMPAT } from "./aiProvider.js";

export async function callAI({ system, user, maxTokens = 1000, json = false, cache = false }) {
  const client = getAIClient();
  const model = getModel();

  if (IS_OPENAI_COMPAT) {
    const params = {
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    };
    if (json) {
      params.response_format = { type: "json_object" };
    }
    const response = await client.chat.completions.create(params);
    return response.choices[0].message.content;
  }

  const systemContent = cache
    ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]
    : system;

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemContent,
    messages: [{ role: "user", content: user }],
  });

  return response.content[0].text;
}

export async function streamCallAI({ system, user, maxTokens = 1000, cache = false, onToken, onComplete }) {
  const client = getAIClient();
  const model = getModel();

  if (IS_OPENAI_COMPAT) {
    const stream = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      stream: true,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    let full = "";
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content || "";
      if (token) {
        full += token;
        onToken?.(token);
      }
    }
    onComplete?.(full);
    return full;
  }

  const systemContent = cache
    ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]
    : system;

  const stream = client.messages.stream({
    model,
    max_tokens: maxTokens,
    system: systemContent,
    messages: [{ role: "user", content: user }],
  });

  let full = "";
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
      const token = event.delta.text;
      full += token;
      onToken?.(token);
    }
  }
  onComplete?.(full);
  return full;
}
