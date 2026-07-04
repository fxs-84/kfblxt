/**
 * MCP 服务器配置管理 — localStorage CRUD。
 * 管理用户添加的 MCP 服务器(HTTP 远程 + stdio 本地)。
 */
import { MCPClient } from "./mcp-client";

const SERVERS_KEY = "anrm_mcp_servers";

export interface MCPServerConfig {
  id: string;
  name: string;
  /** 传输类型 */
  type: "http" | "stdio";
  /** HTTP 时的 MCP 端点 URL */
  url?: string;
  /** stdio 时的命令 */
  command?: string;
  /** stdio 时的参数 */
  args?: string;
  enabled: boolean;
  createdAt: string;
}

function genId(): string {
  return `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

/* ================================================================
 * CRUD
 * ================================================================ */
export function getMCPServers(): MCPServerConfig[] {
  try {
    const raw = localStorage.getItem(SERVERS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as MCPServerConfig[];
  } catch {
    return [];
  }
}

export function saveMCPServers(servers: MCPServerConfig[]): void {
  try {
    localStorage.setItem(SERVERS_KEY, JSON.stringify(servers));
  } catch (e) {
    console.error("[mcp-manager] 保存失败:", e);
  }
}

export function addMCPServer(cfg: Omit<MCPServerConfig, "id" | "createdAt">): MCPServerConfig {
  const servers = getMCPServers();
  const created: MCPServerConfig = { ...cfg, id: genId(), createdAt: nowISO() };
  servers.push(created);
  saveMCPServers(servers);
  return created;
}

export function updateMCPServer(id: string, partial: Partial<Omit<MCPServerConfig, "id" | "createdAt">>): void {
  const servers = getMCPServers();
  const idx = servers.findIndex(s => s.id === id);
  if (idx === -1) return;
  servers[idx] = { ...servers[idx], ...partial };
  saveMCPServers(servers);
}

export function deleteMCPServer(id: string): void {
  saveMCPServers(getMCPServers().filter(s => s.id !== id));
}

/* ================================================================
 * 连接测试
 * ================================================================ */
export async function testMCPConnection(cfg: MCPServerConfig): Promise<{
  ok: boolean;
  serverName?: string;
  toolCount?: number;
  error?: string;
}> {
  try {
    const endpoint = cfg.type === "stdio"
      ? `/api/mcp/${cfg.id}`
      : cfg.url!;

    const client = new MCPClient(endpoint);
    await client.connect();

    const tools = await client.listTools();
    return {
      ok: true,
      serverName: client.name,
      toolCount: tools.length,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** 获取某个服务器的客户端实例(用于构建工具) */
export function createMCPClient(cfg: MCPServerConfig): MCPClient {
  const endpoint = cfg.type === "stdio"
    ? `/api/mcp/${cfg.id}`
    : cfg.url!;
  return new MCPClient(endpoint);
}
