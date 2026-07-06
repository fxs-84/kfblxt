/**
 * Agent Loop — ReAct 风格的工具调用循环。
 * LLM 思考 → 调用工具 → 拿结果 → 再思考 → 直到 final_answer。
 *
 * 所有 HTTP/重试/超时/CORS 都在 llm-client,这里只管:
 *   - 工具查找 + 执行
 *   - 消息拼接(Anthropic vs OpenAI 格式差异)
 *   - 工具结果回传
 *
 * 安全:仅在用户已配置 LLM key 时跑(llm-engine 已保证 key 不进 bundle)。
 * 限流:默认 8 轮工具调用,32K tokens 上限。
 */

import { getLLMConfig, isLLMConfigured } from "../ai/llm-engine";
import {
  callLLM,
  cleanApiUrl,
  resolveFetchUrl,
  LLMCallError,
  type ChatMessage,
  type ToolDescriptor,
} from "../ai/llm-client";
import { getTool } from "./tools/registry";
import { MCPBridge } from "./tools/mcp-bridge";
import { buildSkillPrompt } from "./tools/skill-system";
import type { ToolContext, AgentTool } from "./tools/schemas";

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

### 内部病历工具
你可以通过工具查询患者的就诊记录、诊断、查体、治疗计划,并基于这些临床数据回答问题。

### 外部联通工具(开箱即用,无需额外配置)
你可以:
- **web_fetch** — 抓取任意 URL 的内容(用户提供的链接、指南 PDF、药品说明书等)
- **search_pubmed** — 检索 PubMed 生物医学文献数据库(查证循证医学证据,免费 API)
- **calculate** — 执行数学计算(药物剂量、量表统计等)
- **get_current_time** — 获取当前日期时间
- **install_skill** — 从 URL 安装新技能(Skill),扩展我的能力
- 用户可能上传文件(文本/CSV/JSON/图片/PDF),我会读取并分析

### 可选工具(需用户在高级设置里启用)
- **web_search** — 通用互联网搜索。默认禁用 — 大部分问题可由 LLM 知识 + PubMed + 用户提供 URL 解决;只有需要最新通用信息时才需要启用并配 Bing/SearXNG。

### 你可以帮治疗师
- 总结病例、生成 SOAP 笔记
- 撰写转诊信
- 检索相似历史病例
- 解释 ANRM 神经康复推理
- **查证最新医学文献和临床指南**(通过 web_search / search_pubmed)
- **回答临床问题**(结合病历数据 + 外部医学知识)
- **计算药物剂量、评估量表分数**
- **安装新技能** — 当用户发来 Skill 文件 URL 时,主动调用 install_skill 安装

## 工作风格
- 始终引用查询到的具体数据(患者姓名、日期、诊断名、干预名)
- 不确定时主动调用工具查询,不臆测
- 回答以中文为主,医学术语保留英文
- 长输出用 Markdown 标题/列表分层
- **涉及外部信息时,优先用 web_search 或 search_pubmed 查证,而非凭记忆回答**
- 引用外部来源时注明出处(URL/PMID)
- **当用户提到 URL 且看起来像 Skill 文件时,主动询问是否安装,或直接调用 install_skill**

## 重要约束
- 工具返回的 JSON 数据是真实记录,请严格基于此回答
- 不要捏造患者姓名、诊断、日期
- 涉及隐私时提醒"仅供内部使用"
- 医学建议仅供参考,最终决策由治疗师把握
`;

export type AgentTraceEvent =
  | { type: "tool_call"; name: string; input: unknown }
  | { type: "tool_result"; name: string; output: string }
  | { type: "text"; text: string };

export async function runAgent(
  userMessage: string,
  ctx: ToolContext,
  history: AgentMessage[] = [],
  onTrace?: (event: AgentTraceEvent) => void,
): Promise<AgentRunResult> {
  if (!isLLMConfigured()) {
    return {
      answer: "⚠️ AI Agent 需要先配置 LLM API key。\n\n请在 AI 助手面板点 🔑 按钮,填入你的 API URL 和 Key。\n未配置时我会自动用本地规则引擎回答(但不调用工具)。",
      messages: [{ role: "user", content: userMessage }, { role: "assistant", content: "未配置 LLM" }],
      trace: [],
      truncated: false,
    };
  }

  const cfg = await getLLMConfig();
  if (!cfg) {
    return {
      answer: "⚠️ LLM 配置无效,请重新设置 API Key。",
      messages: [{ role: "user", content: userMessage }, { role: "assistant", content: "配置无效" }],
      trace: [],
      truncated: false,
    };
  }

  // Skill 注入
  const skillPrompt = buildSkillPrompt(userMessage);
  const systemMessage: ChatMessage = { role: "system", content: SYSTEM_PROMPT + skillPrompt };

  // 加载工具(静态 + MCP)
  const [mcpTools, staticToolsModule] = await Promise.all([
    new MCPBridge(ctx).getTools(),
    import("./tools/registry"),
  ]);
  const staticAgentTools = staticToolsModule.agentTools;
  const allAgentTools: AgentTool[] = [...staticAgentTools, ...mcpTools];
  const toolMap = new Map<string, AgentTool>();
  for (const t of allAgentTools) toolMap.set(t.name, t);

  const tools: ToolDescriptor[] = allAgentTools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: zodToJsonSchema(t),
  }));

  // 消息序列(扁平,便于维护)
  const flatMessages: ChatMessage[] = [
    systemMessage,
    ...history.filter((m) => m.role !== "system").map(toChatMessage),
    { role: "user", content: userMessage },
  ];

  // 工具调用记录(供后续格式转换)
  const assistantRecords: AgentMessage[] = [];
  const trace: AgentRunResult["trace"] = [];
  let truncated = false;
  let usage: AgentRunResult["usage"];
  let totalOutputTokens = 0;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const result = await callLLM(flatMessages, cfg, { tools, maxTokens: 4000 });

    usage = result.usage;
    totalOutputTokens += usage?.output_tokens ?? 0;
    if (totalOutputTokens > MAX_TOKENS) {
      truncated = true;
      break;
    }

    if (result.text) onTrace?.({ type: "text", text: result.text });

    // 没工具调用 → 最终答案
    if (result.toolCalls.length === 0) {
      const finalAssistant: AgentMessage = { role: "assistant", content: result.text };
      assistantRecords.push(finalAssistant);
      return {
        answer: result.text,
        messages: [...assistantRecords],
        trace,
        usage,
        truncated,
      };
    }

    // 记录 assistant 这一轮
    const assistantRecord: AgentMessage = {
      role: "assistant",
      content: result.text,
      toolCalls: result.toolCalls,
    };
    assistantRecords.push(assistantRecord);
    flatMessages.push({ role: "assistant", content: result.text });

    // 执行工具
    const toolResultRecords: ToolResultRecord[] = [];
    for (const tc of result.toolCalls) {
      onTrace?.({ type: "tool_call", name: tc.name, input: tc.input });
      const tool = toolMap.get(tc.name);
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
            output = `ERROR: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`;
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
      toolResultRecords.push({ toolCallId: tc.id, name: tc.name, output: output.slice(0, 8000), error });
      onTrace?.({ type: "tool_result", name: tc.name, output: output.slice(0, 200) });
    }

    // 工具结果拼到下一轮 user 消息(让 LLM 看到)
    const toolFeedback = toolResultRecords
      .map((tr) => `[${tr.name}] ${tr.error ? "❌" : "✓"}\n${tr.output}`)
      .join("\n\n");
    flatMessages.push({ role: "user", content: toolFeedback });

    assistantRecords.push({
      role: "user",
      content: "",
      toolResults: toolResultRecords,
    });
  }

  truncated = true;
  const last = [...assistantRecords].reverse().find((m) => m.role === "assistant" && m.content);
  return {
    answer: last?.content ?? "达到工具调用上限,会话中断。",
    messages: assistantRecords,
    trace,
    usage,
    truncated,
  };
}

function toChatMessage(m: AgentMessage): ChatMessage {
  return { role: m.role === "system" ? "system" : m.role, content: m.content };
}

/* ============================================================
 *  MCP 工具 schema 转换(只在 agent-loop 内部用)
 * ============================================================ */

function zodToJsonSchema(t: AgentTool): Record<string, unknown> {
  const schema: Record<string, unknown> = { type: "object", properties: {} };
  const props: Record<string, unknown> = {};
  try {
    const shape = (t.inputSchema as { shape?: () => Record<string, { _def?: { typeName?: string; description?: string; values?: unknown; defaultValue?: () => unknown } }> }).shape;
    if (typeof shape === "function") {
      const entries = shape();
      for (const [key, field] of Object.entries(entries)) {
        const def = field._def;
        if (!def) { props[key] = {}; continue; }
        const typeMap: Record<string, string> = {
          ZodString: "string", ZodNumber: "number", ZodBoolean: "boolean",
          ZodEnum: "string", ZodOptional: "string", ZodDefault: "string",
          ZodArray: "array",
        };
        const p: Record<string, unknown> = { type: typeMap[def.typeName || ""] || "string" };
        if (def.description) p.description = def.description;
        if (def.typeName === "ZodEnum" && def.values) p.enum = def.values;
        props[key] = p;
      }
    }
  } catch { /* best effort */ }
  schema.properties = props;
  return schema;
}

/* 重导出供 UI 接入 */
export { cleanApiUrl, resolveFetchUrl, LLMCallError };
