/**
 * MCP 桥接层 — 连接所有启用的 MCP 服务器,动态发现工具,包装为 AgentTool。
 *
 * 使用方式:
 *   const bridge = new MCPBridge({ orgId, userId });
 *   const tools = await bridge.getTools();    // 本地工具 + MCP 工具
 *   const tool = bridge.getTool(name);        // 按名查找
 *
 * 缓存策略: tools/list 结果缓存 5 分钟,避免每次对话都重新发现。
 */
import type { AgentTool } from "./schemas";
import type { ToolContext } from "./schemas";
import { getMCPServers, createMCPClient } from "./mcp-manager";
import { mcpToolToAgentTool } from "./mcp-client";

interface CacheEntry {
  tools: AgentTool[];
  timestamp: number;
}
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

export class MCPBridge {
  private ctx: ToolContext;
  private cache = new Map<string, CacheEntry>();
  private toolMap = new Map<string, AgentTool>();

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  /** 获取所有 MCP 工具(带缓存) */
  async getTools(): Promise<AgentTool[]> {
    const servers = getMCPServers().filter(s => s.enabled);
    const allTools: AgentTool[] = [];
    this.toolMap.clear();

    for (const srv of servers) {
      const cached = this.cache.get(srv.id);
      if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        for (const t of cached.tools) {
          allTools.push(t);
          this.toolMap.set(t.name, t);
        }
        continue;
      }

      try {
        const client = createMCPClient(srv);
        const defs = await client.listTools();
        const tools = defs.map(d => mcpToolToAgentTool(client, d, this.ctx));
        this.cache.set(srv.id, { tools, timestamp: Date.now() });
        for (const t of tools) {
          allTools.push(t);
          this.toolMap.set(t.name, t);
        }
      } catch (e) {
        console.warn(`[mcp-bridge] 服务器 "${srv.name}" 连接失败:`, e instanceof Error ? e.message : e);
        // 使用旧缓存作为降级
        const stale = this.cache.get(srv.id);
        if (stale) {
          for (const t of stale.tools) {
            allTools.push(t);
            this.toolMap.set(t.name, t);
          }
        }
      }
    }

    return allTools;
  }

  /** 按名查找工具(先查静态注册表,此处仅 MCP 工具) */
  getTool(name: string): AgentTool | undefined {
    return this.toolMap.get(name);
  }

  /** 刷新缓存(强制重新发现) */
  clearCache(): void {
    this.cache.clear();
    this.toolMap.clear();
  }
}
