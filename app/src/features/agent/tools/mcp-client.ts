/**
 * MCP (Model Context Protocol) 客户端 — JSON-RPC 2.0 over HTTP。
 *
 * 支持两种传输:
 * 1. HTTP 传输 — 直接 POST 到远程 MCP 端点 (Streamable HTTP)
 * 2. Vite 代理传输 — POST 到 /api/mcp/<name> ,由 Vite 中间件 spawn 子进程
 *
 * 协议参考: https://spec.modelcontextprotocol.io/specification/2024-11-05/
 */
import type { AgentTool } from "./schemas";
import { z } from "zod";

/* ================================================================
 * JSON-RPC 2.0 类型
 * ================================================================ */
let nextId = 1;

interface JSONRPCRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JSONRPCResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/* ================================================================
 * MCP 工具定义类型 (服务器返回的)
 * ================================================================ */
interface MCPToolDef {
  name: string;
  description?: string;
  inputSchema?: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

interface MCPListToolsResult {
  tools: MCPToolDef[];
}

interface MCPCallToolParams {
  name: string;
  arguments?: Record<string, unknown>;
}

interface MCPCallToolResult {
  content: Array<{ type: "text" | "image" | "resource"; text?: string; data?: string; mimeType?: string }>;
  isError?: boolean;
}

/* ================================================================
 * HTTP 传输
 * ================================================================ */
export class MCPClient {
  private endpoint: string;
  private connected = false;
  private serverCapabilities: Record<string, unknown> = {};
  private serverName = "";

  constructor(endpoint: string) {
    this.endpoint = endpoint.replace(/\/+$/, "");
  }

  get isConnected(): boolean { return this.connected; }
  get name(): string { return this.serverName; }

  /** 初始化连接 */
  async connect(): Promise<void> {
    const result = await this.send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      clientInfo: { name: "anrm-agent", version: "1.0.0" },
    }) as { protocolVersion?: string; capabilities?: Record<string, unknown>; serverInfo?: { name: string; version: string } };

    this.serverCapabilities = result.capabilities || {};
    this.serverName = result.serverInfo?.name || "unknown";
    this.connected = true;

    // 发送 initialized 通知
    await this.notify("notifications/initialized", {});
  }

  /** 获取工具列表 */
  async listTools(): Promise<MCPToolDef[]> {
    if (!this.connected) await this.connect();
    const result = await this.send("tools/list", {}) as MCPListToolsResult;
    return result.tools || [];
  }

  /** 调用工具 */
  async callTool(params: MCPCallToolParams): Promise<MCPCallToolResult> {
    if (!this.connected) await this.connect();
    return await this.send("tools/call", params) as MCPCallToolResult;
  }

  /** 发送 JSON-RPC 请求 */
  private async send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const request: JSONRPCRequest = {
      jsonrpc: "2.0",
      id: nextId++,
      method,
      params,
    };

    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`MCP HTTP ${res.status}: ${text.slice(0, 300)}`);
    }

    const response: JSONRPCResponse = await res.json();
    if (response.error) {
      throw new Error(`MCP error ${response.error.code}: ${response.error.message}`);
    }
    return response.result;
  }

  /** 发送通知 (无响应) */
  private async notify(method: string, params?: Record<string, unknown>): Promise<void> {
    const request = {
      jsonrpc: "2.0" as const,
      notification: true,
      method,
      params,
    };
    try {
      await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
    } catch { /* notifications are fire-and-forget */ }
  }
}

/* ================================================================
 * MCP 工具 → AgentTool 桥接
 * ================================================================ */

/** 将 MCP 工具定义包装为我们自己的 AgentTool */
export function mcpToolToAgentTool(
  client: MCPClient,
  def: MCPToolDef,
  ctx: { orgId: string; userId: string },
): AgentTool {
  // 从 inputSchema 构建一个宽容的 Zod schema
  const props = def.inputSchema?.properties || {};
  const required = new Set(def.inputSchema?.required || []);

  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, prop] of Object.entries(props)) {
    const p = prop as Record<string, unknown>;
    const type = p.type as string | undefined;
    const desc = p.description as string | undefined;
    if (type === "string") {
      const s = z.string();
      shape[key] = desc ? s.describe(desc) : s;
    } else if (type === "number" || type === "integer") {
      const n = z.number();
      shape[key] = desc ? n.describe(desc) : n;
    } else if (type === "boolean") {
      const b = z.boolean();
      shape[key] = desc ? b.describe(desc) : b;
    } else if (type === "array") {
      shape[key] = z.array(z.unknown());
    } else {
      shape[key] = z.unknown();
    }
    if (!required.has(key)) {
      shape[key] = shape[key].optional();
    }
  }

  const schema = z.object(shape);

  return {
    name: `mcp_${client.name.replace(/[^a-zA-Z0-9_-]/g, "_")}__${def.name}`,
    description: `[MCP:${client.name}] ${def.description || def.name}`,
    inputSchema: schema,
    execute: async (input) => {
      const result = await client.callTool({
        name: def.name,
        arguments: input as Record<string, unknown>,
      });
      if (result.isError) {
        const errorText = result.content.map(c => c.text || "").join("\n");
        return `ERROR: ${errorText}`;
      }
      return result.content.map(c => c.text || "").join("\n") || "(empty result)";
    },
  };
}
