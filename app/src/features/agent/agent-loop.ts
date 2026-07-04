/**
 * Agent Loop — ReAct 风格的工具调用循环。
 * LLM 思考 → 调用工具 → 拿结果 → 再思考 → 直到 final_answer。
 *
 * 支持 Anthropic Messages API 和 OpenAI-compatible API(DeepSeek/OpenRouter/等)。
 *
 * 安全:仅在用户已配置 LLM key 时跑(llm-engine 已保证 key 不进 bundle)。
 * 限流:默认 8 轮工具调用,32K tokens 上限。
 */
import { getLLMConfig, isLLMConfigured } from "../ai/llm-engine";
import {
  buildApiHeaders,
  detectApiType,
  type ApiType,
  toolsToOpenAISchema,
  parseAnthropicResponse,
  parseOpenAIResponse,
} from "../ai/api-adapter";
import { getTool } from "./tools/registry";
import type { ToolContext } from "./tools/schemas";

const MAX_TURNS = 8;
const MAX_TOKENS = 32000;

export interface AgentMessage {
  role: "user" | "assistant" | "system";
  content: string;
  toolCalls?: ToolCallRecord[];
  toolResults?: ToolResultRecord[];
}

export interface ToolCallRecord {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultRecord {
  toolCallId: string;
  name: string;
  output: string;
  error?: boolean;
}

export interface AgentRunResult {
  answer: string;
  messages: AgentMessage[];
  trace: Array<{ turn: number; name: string; input: unknown; output: string; durationMs: number }>;
  usage?: { input_tokens: number; output_tokens: number };
  truncated: boolean;
}

const SYSTEM_PROMPT = `你是 ANRM 临床智能助手,服务神经康复治疗师。

## 你的能力
你可以通过工具查询患者的就诊记录、诊断、查体、治疗计划,并基于这些临床数据回答问题。
你也可以帮治疗师:
- 总结病例、生成 SOAP 笔记
- 撰写转诊信
- 检索相似历史病例
- 解释 ANRM 神经康复推理

## 工作风格
- 始终引用查询到的具体数据(患者姓名、日期、诊断名、干预名)
- 不确定时主动调用工具查询,不臆测
- 回答以中文为主,医学术语保留英文
- 长输出用 Markdown 标题/列表分层

## 重要约束
- 工具返回的 JSON 数据是真实记录,请严格基于此回答
- 不要捏造患者姓名、诊断、日期
- 涉及隐私时提醒"仅供内部使用"
`;

export async function runAgent(
  userMessage: string,
  ctx: ToolContext,
  history: AgentMessage[] = [],
  onTrace?: (event: { type: "tool_call"; name: string; input: unknown } | { type: "tool_result"; name: string; output: string } | { type: "text"; text: string }) => void,
): Promise<AgentRunResult> {
  if (!isLLMConfigured()) {
    return {
      answer: "⚠️ AI Agent 需要先配置 LLM API key。\n\n请在 AI 助手面板点 🔑 按钮,填入你的 API URL 和 Key。\n未配置时我会自动用本地规则引擎回答(但不调用工具)。",
      messages: [{ role: "user", content: userMessage }, { role: "assistant", content: "未配置 LLM" }],
      trace: [],
      truncated: false,
    };
  }

  const cfg = getLLMConfig()!;
  const apiType = detectApiType(cfg.apiUrl);
  const rawMessages: AgentMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "user", content: userMessage },
  ];
  const trace: AgentRunResult["trace"] = [];
  let truncated = false;
  let usage: AgentRunResult["usage"];
  let totalOutputTokens = 0;
  const anthropicTools = (await import("./tools/registry")).toolsToAnthropicSchema();
  const headers = buildApiHeaders(cfg.apiKey, cfg.apiUrl);

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const body = buildRequestBody(apiType, rawMessages, anthropicTools, cfg.model);
    const res = await fetch(cfg.apiUrl, { method: "POST", headers, body: JSON.stringify(body) });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      const hint = errText.slice(0, 300);
      throw new Error(`API ${res.status}${hint ? ": " + hint : ""} (${cfg.apiUrl})`);
    }
    const data = await res.json() as Record<string, unknown>;
    const parsed = apiType === "anthropic" ? parseAnthropicResponse(data) : parseOpenAIResponse(data);

    usage = parsed.usage;
    totalOutputTokens += usage?.output_tokens ?? 0;
    if (totalOutputTokens > MAX_TOKENS) { truncated = true; break; }

    if (parsed.text) onTrace?.({ type: "text", text: parsed.text });

    rawMessages.push({
      role: "assistant",
      content: parsed.text,
      toolCalls: parsed.toolCalls.length > 0 ? parsed.toolCalls : undefined,
    });

    if (parsed.toolCalls.length === 0) {
      return { answer: parsed.text, messages: rawMessages, trace, usage, truncated };
    }

    // 执行工具
    const results: ToolResultRecord[] = [];
    for (const tc of parsed.toolCalls) {
      onTrace?.({ type: "tool_call", name: tc.name, input: tc.input });
      const tool = getTool(tc.name);
      const startedAt = Date.now();
      let output: string;
      let error = false;
      if (!tool) {
        output = `ERROR: 未知工具 "${tc.name}"`;
        error = true;
      } else {
        try {
          const parsedInput = tool.inputSchema.safeParse(tc.input);
          if (!parsedInput.success) {
            output = `ERROR: ${parsedInput.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}`;
            error = true;
          } else {
            output = await tool.execute(parsedInput.data, ctx);
          }
        } catch (e) {
          output = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
          error = true;
        }
      }
      const durationMs = Date.now() - startedAt;
      trace.push({ turn, name: tc.name, input: tc.input, output: output.slice(0, 8000), durationMs });
      results.push({ toolCallId: tc.id, name: tc.name, output: output.slice(0, 8000), error });
      onTrace?.({ type: "tool_result", name: tc.name, output: output.slice(0, 200) });
    }

    rawMessages.push({ role: "user", content: "", toolResults: results });
  }

  truncated = true;
  const last = [...rawMessages].reverse().find(m => m.role === "assistant" && m.content);
  return { answer: last?.content ?? "达到工具调用上限,会话中断。", messages: rawMessages, trace, usage, truncated };
}

/** 构建 Anthropic 格式的工具结果消息 */
function buildAnthropicToolResult(toolResults: ToolResultRecord[]): Record<string, unknown> {
  return {
    role: "user",
    content: toolResults.map(tr => ({
      type: "tool_result",
      tool_use_id: tr.toolCallId,
      content: tr.output,
      is_error: tr.error,
    })),
  };
}

/** 构建 OpenAI 格式的工具结果消息 */
function buildOpenAIToolMessages(
  prevToolCalls: ToolCallRecord[],
  toolResults: ToolResultRecord[],
): Array<Record<string, unknown>> {
  const msgs: Array<Record<string, unknown>> = [];

  // 先把 assistant 的 tool_calls 发出去(已在 messages 列表中但需要组装到这里)
  // OpenAI 格式: assistant 发 tool_calls → user 回 tool role message
  msgs.push({
    role: "assistant",
    content: null,
    tool_calls: prevToolCalls.map(tc => ({
      id: tc.id,
      type: "function",
      function: { name: tc.name, arguments: JSON.stringify(tc.input) },
    })),
  });

  for (let i = 0; i < toolResults.length; i++) {
    const tr = toolResults[i];
    msgs.push({
      role: "tool",
      tool_call_id: tr.toolCallId,
      content: tr.output,
    });
  }
  return msgs;
}

/** 构建请求体(Anthropic 或 OpenAI 格式) */
function buildRequestBody(
  apiType: ApiType,
  allMessages: AgentMessage[],
  anthropicTools: Array<Record<string, unknown>>,
  model: string,
): Record<string, unknown> {
  const systemMsg = allMessages.find(m => m.role === "system");
  const conv = allMessages.filter(m => m.role !== "system");

  if (apiType === "anthropic") {
    const anthropicMsgs: Array<Record<string, unknown>> = [];
    for (let i = 0; i < conv.length; i++) {
      const m = conv[i];
      if (m.role === "user" && m.toolResults && m.toolResults.length > 0) {
        anthropicMsgs.push(buildAnthropicToolResult(m.toolResults));
        continue;
      }
      if (m.role === "assistant") {
        const blocks: Array<Record<string, unknown>> = [];
        if (m.content) blocks.push({ type: "text", text: m.content });
        if (m.toolCalls) {
          for (const tc of m.toolCalls) {
            blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
          }
        }
        anthropicMsgs.push({ role: "assistant", content: blocks });
        continue;
      }
      anthropicMsgs.push({ role: m.role, content: m.content });
    }
    return {
      model,
      max_tokens: 4000,
      system: systemMsg?.content ?? SYSTEM_PROMPT,
      tools: anthropicTools,
      messages: anthropicMsgs,
    };
  }

  // OpenAI-compatible
  const openaiTools = toolsToOpenAISchema(anthropicTools);
  const openaiMsgs: Array<Record<string, unknown>> = [];
  openaiMsgs.push({ role: "system", content: systemMsg?.content ?? SYSTEM_PROMPT });

  for (let i = 0; i < conv.length; i++) {
    const m = conv[i];
    if (m.role === "user" && m.toolResults && m.toolResults.length > 0) {
      // 需要回溯找到上一轮 assistant 的 tool_calls
      const prevAssistant = i > 0 ? conv[i - 1] : null;
      if (prevAssistant && prevAssistant.role === "assistant" && prevAssistant.toolCalls) {
        openaiMsgs.push(...buildOpenAIToolMessages(prevAssistant.toolCalls, m.toolResults));
      }
      continue;
    }
    if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
      // assistant 带 tool_calls → 按 OpenAI 格式发送
      openaiMsgs.push({
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls.map(tc => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.input) },
        })),
      });
      continue;
    }
    if (m.role === "assistant" && !m.toolCalls) {
      openaiMsgs.push({ role: "assistant", content: m.content });
      continue;
    }
    if (m.role === "user" && !m.toolResults) {
      openaiMsgs.push({ role: "user", content: m.content });
    }
  }

  return {
    model,
    max_tokens: 4000,
    tools: openaiTools,
    messages: openaiMsgs,
  };
}