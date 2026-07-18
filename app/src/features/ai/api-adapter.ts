/**
 * API 兼容层 — 自动检测 Anthropic vs OpenAI-compatible API,
 * 转换请求头 + 消息体 + 响应解析。
 */

export type ApiType = "anthropic" | "openai";

/** 根据 API URL 判断类型(支持 Anthropic 官方 + DeepSeek Anthropic 兼容端点) */
export function detectApiType(apiUrl: string): ApiType {
  const lower = apiUrl.toLowerCase();
  if (lower.includes("anthropic.com")) return "anthropic";
  if (lower.includes("/anthropic")) return "anthropic"; // DeepSeek Anthropic 兼容端点
  return "openai";
}

/** 构建请求头 */
export function buildApiHeaders(apiKey: string, apiUrl: string): Record<string, string> {
  const lower = apiUrl.toLowerCase();
  if (lower.includes("anthropic.com") || lower.includes("/anthropic")) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    };
    // 只有官方 Anthropic 端点发 anthropic-version
    if (lower.includes("anthropic.com")) {
      headers["anthropic-version"] = "2023-06-01";
    }
    return headers;
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
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
