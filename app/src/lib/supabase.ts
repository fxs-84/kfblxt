import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnv } from "./env";
import { readStoredConfig, isSupabaseSkipped, type SupabaseConfig } from "../components/SetupWizard";

let client: SupabaseClient | null = null;
let initError: string | null = null;

/**
 * 解析运行时 Supabase 配置(优先级):
 *   1. 浏览器 localStorage(用户在 SetupWizard 填的,各自独立)
 *   2. 用户点过"暂时跳过" → null(单机版,持久化标记)
 *   3. .env / 构建时 env vars(开发者预设;识别占位符则忽略)
 *   4. 都没有 → null(走单机版)
 */
/** 占位符域名(模板/示例值,不是真实 Supabase 项目)—— 识别后走单机,避免全应用打到不存在的域名 */
export function isPlaceholderSupabaseUrl(url: string | undefined): boolean {
  if (!url) return true;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (
      host.startsWith("your-project-ref") ||
      host.startsWith("example.") ||
      host.startsWith("your-project") ||
      host === "supabase.co"
    ) {
      return true;
    }
    return false;
  } catch {
    return true; // 无法解析的 URL 视为不可用
  }
}

/** Supabase 项目 ref — 从 localStorage key 提取,用于从 Auth 会话重建配置 */
function detectProjectRef(): string | null {
  try {
    const keys = Object.keys(localStorage);
    const authKey = keys.find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
    if (!authKey) return null;
    // sb-<ref>-auth-token
    return authKey.slice(3, -12);
  } catch {
    return null;
  }
}

function resolveConfig(): SupabaseConfig | null {
  const stored = readStoredConfig();
  if (stored) return stored;
  // 用户明确选择单机模式(持久化标记),即使 env 里有占位符也不再走云端
  if (isSupabaseSkipped()) return null;
  try {
    const env = loadEnv();
    if (
      env.VITE_SUPABASE_URL &&
      env.VITE_SUPABASE_ANON_KEY &&
      !isPlaceholderSupabaseUrl(env.VITE_SUPABASE_URL)
    ) {
      return {
        url: env.VITE_SUPABASE_URL,
        anonKey: env.VITE_SUPABASE_ANON_KEY,
      };
    }
  } catch {
    /* noop */
  }
  // 兜底:Wizard 配置可能被清,但 Auth 会话仍在 — 从会话重建,key 必须来自环境变量
  const ref = detectProjectRef();
  if (ref) {
    const anonKey = typeof import.meta.env !== "undefined"
      ? import.meta.env.VITE_SUPABASE_ANON_KEY
      : undefined;
    if (typeof anonKey === "string" && anonKey && !isPlaceholderSupabaseUrl(`https://${ref}.supabase.co`)) {
      return {
        url: `https://${ref}.supabase.co`,
        anonKey,
      };
    }
  }
  return null;
}

/** 懒初始化 Supabase 客户端——未配时返回 null,不抛错 */
export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  if (initError) return null;
  const cfg = resolveConfig();
  if (!cfg) return null;
  try {
    client = createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    return client;
  } catch (e) {
    initError = e instanceof Error ? e.message : String(e);
    return null;
  }
}

/** 强制重置缓存(供用户点"重置配置"后重连) */
export function resetSupabaseClient(): void {
  client = null;
  initError = null;
}

/** 当前是否配了 Supabase(读 localStorage 或 env) */
export function hasSupabaseConfig(): boolean {
  return resolveConfig() !== null;
}

/** 为向后兼容保留,内部调用 getSupabase() */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    const s = getSupabase();
    if (!s) {
      throw new Error("Supabase 未配置 — 首次访问会显示配置向导;或者您可以编辑 .env.local");
    }
    return (s as unknown as Record<string | symbol, unknown>)[prop];
  },
});
