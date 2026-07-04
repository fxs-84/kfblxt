/**
 * Agent 工具类型 — 兼容 Anthropic tool_use 协议。
 * 每个工具: name + description + input_schema(Zod) + execute。
 */
import { z } from "zod";

export interface AgentTool<T extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  inputSchema: T;
  /** 工具调用入口;返回 Markdown 字符串喂给 LLM */
  execute: (input: z.infer<T>, ctx: ToolContext) => Promise<string>;
}

export interface ToolContext {
  /** 当前 session 的 orgId — 多机构隔离 */
  orgId: string;
  /** 当前 session 的 userId — 用于"我创建的"过滤 */
  userId: string;
}

/** 工具调用结果(简化版,LLM 友好) */
export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export function toToolResult(r: ToolResult): string {
  if (r.ok) return JSON.stringify(r.data, null, 2);
  return `ERROR: ${r.error ?? "unknown"}`;
}