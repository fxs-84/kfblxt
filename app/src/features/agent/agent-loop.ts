/**
 * Agent Loop — ReAct 风格的工具调用循环。
 * LLM 思考 → 调用工具 → 拿结果 → 再思考 → 直到 final_answer。
 *
 * 安全:仅在用户已配置 LLM key 时跑(llm-engine 已保证 key 不进 bundle)。
 * 限流:默认 8 轮工具调用,32K tokens 上限。
 */
import { z } from "zod";
import { getLLMConfig, isLLMConfigured } from "../ai/llm-engine";
import { getTool } from "./tools/registry";
import type { ToolContext } from "./tools/schemas";
import type { AgentTool } from "./tools/schemas";

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
  /** 最终助手回答 */
  answer: string;
  /** 完整对话(可持久化) */
  messages: AgentMessage[];
  /** 工具调用轨迹 */
  trace: Array<{ turn: number; name: string; input: unknown; output: string; durationMs: number }>;
  /** token 用量 */
  usage?: { input_tokens: number; output_tokens: number };
  /** 是否截断(达到 MAX_TURNS) */
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
  const messages: AgentMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "user", content: userMessage },
  ];
  const trace: AgentRunResult["trace"] = [];
  let truncated = false;
  let usage: AgentRunResult["usage"];
  let totalOutputTokens = 0;

  const tools = (await import("./tools/registry")).toolsToAnthropicSchema();

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const anthropicMessages = messages
      .filter(m => m.role !== "system")
      .map(m => {
        if (m.role === "user") {
          if (m.toolResults && m.toolResults.length > 0) {
            return {
              role: "user" as const,
              content: m.toolResults.map(tr => ({
                type: "tool_result" as const,
                tool_use_id: tr.toolCallId,
                content: tr.output,
                is_error: tr.error,
              })),
            };
          }
          return { role: "user" as const, content: m.content };
        }
        // assistant
        const blocks: Array<Record<string, unknown>> = [];
        if (m.content) blocks.push({ type: "text", text: m.content });
        if (m.toolCalls) {
          for (const tc of m.toolCalls) {
            blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
          }
        }
        return { role: "assistant" as const, content: blocks };
      });

    const res = await fetch(cfg.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        tools,
        messages: anthropicMessages,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`LLM API ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    usage = data.usage;
    totalOutputTokens += usage?.output_tokens ?? 0;
    if (totalOutputTokens > MAX_TOKENS) {
      truncated = true;
      break;
    }

    const blocks: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }> = data.content ?? [];
    const text = blocks.filter(b => b.type === "text").map(b => b.text ?? "").join("");
    const toolCalls: ToolCallRecord[] = blocks
      .filter(b => b.type === "tool_use")
      .map(b => ({ id: b.id!, name: b.name!, input: b.input ?? {} }));

    if (text) onTrace?.({ type: "text", text });

    messages.push({
      role: "assistant",
      content: text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    });

    if (toolCalls.length === 0) {
      // LLM 认为回答完毕
      return {
        answer: text,
        messages,
        trace,
        usage,
        truncated,
      };
    }

    // 执行工具
    const results: ToolResultRecord[] = [];
    for (const tc of toolCalls) {
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
          const parsed = tool.inputSchema.safeParse(tc.input);
          if (!parsed.success) {
            output = `ERROR: 参数校验失败: ${parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}`;
            error = true;
          } else {
            output = await tool.execute(parsed.data, ctx);
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

    messages.push({
      role: "user",
      content: "",
      toolResults: results,
    });
  }

  // 达到 MAX_TURNS
  truncated = true;
  const lastAssistant = [...messages].reverse().find(m => m.role === "assistant" && m.content);
  return {
    answer: lastAssistant?.content ?? "达到工具调用上限,会话中断。请缩短问题或分步询问。",
    messages,
    trace,
    usage,
    truncated,
  };
}