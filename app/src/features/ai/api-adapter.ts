/**
 * API 兼容层 — 自动检测 Anthropic vs OpenAI-compatible API,
 * 转换请求头 + 消息体 + 响应解析。
 */

export type ApiType = "anthropic" | "openai";

/** 根据 API URL 判断类型 */
export function detectApiType(apiUrl: string): ApiType {
  return apiUrl.includes("anthropic.com") ? "anthropic" : "openai";
}

/** 构建请求头 */
export function buildApiHeaders(apiKey: string, apiUrl: string): Record<string, string> {
  if (detectApiType(apiUrl) === "anthropic") {
    return {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    };
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

/**
 * 转成 Anthropic style system prompt（两个 API 都支持）
 */
export function buildSystemMessage(systemPrompt: string, apiType: ApiType): unknown {
  if (apiType === "anthropic") {
    return systemPrompt;
  }
  // OpenAI: system 是 message 数组里的一条
  return [{ role: "system", content: systemPrompt }];
}

/**
 * 转成对应 API 的 messages 格式
 * anthropic: content 是 text blocks 数组 + tool_use blocks
 * openai:   content 是 string, tool_calls 是单独字段
 */
export function toAnthropicMessages(messages: Array<{ role: string; content: string }>): unknown[] {
  return messages.map(m => ({
    role: m.role,
    content: m.content,
  }));
}

export function toOpenAIMessages(
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string,
): unknown[] {
  const result: Array<{ role: string; content: string }> = [];
  result.push({ role: "system", content: systemPrompt });
  for (const m of messages) {
    result.push({ role: m.role, content: m.content });
  }
  return result;
}

/** OpenAI → Anthropic tool schema 转换 */
export function toolsToOpenAISchema(anthropicTools: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return anthropicTools.map(t => {
    const inputSchema = t.input_schema as Record<string, unknown> | undefined;
    return {
      type: "function" as const,
      function: {
        name: t.name as string,
        description: t.description as string,
        parameters: inputSchema ?? { type: "object", properties: {} },
      },
    };
  });
}

/** 解析 OpenAI 响应 → 统一结构 */
export function parseOpenAIResponse(data: Record<string, unknown>): {
  text: string;
  toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  usage?: { input_tokens: number; output_tokens: number };
} {
  const choice = (data.choices as Array<Record<string, unknown>>)?.[0];
  const msg = choice?.message as Record<string, unknown> | undefined;
  const text = (msg?.content as string) ?? "";
  const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
  const rawCalls = msg?.tool_calls as Array<Record<string, unknown>> | undefined;
  if (rawCalls) {
    for (const tc of rawCalls) {
      toolCalls.push({
        id: tc.id as string,
        name: (tc.function as Record<string, unknown>)?.name as string ?? "",
        input: JSON.parse(((tc.function as Record<string, unknown>)?.arguments as string) || "{}"),
      });
    }
  }
  return {
    text,
    toolCalls,
    usage: data.usage as { input_tokens: number; output_tokens: number } | undefined,
  };
}

/** 解析 Anthropic 响应 → 统一结构 */
export function parseAnthropicResponse(data: Record<string, unknown>): {
  text: string;
  toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  usage?: { input_tokens: number; output_tokens: number };
} {
  const blocks = (data.content as Array<Record<string, unknown>>) ?? [];
  const text = blocks.filter(b => b.type === "text").map(b => b.text ?? "").join("");
  const toolCalls = blocks
    .filter(b => b.type === "tool_use")
    .map(b => ({
      id: b.id as string,
      name: b.name as string,
      input: (b.input as Record<string, unknown>) ?? {},
    }));
  return { text, toolCalls, usage: data.usage as { input_tokens: number; output_tokens: number } | undefined };
}
