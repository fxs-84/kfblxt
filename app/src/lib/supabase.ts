import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnv } from "./env";

let client: SupabaseClient | null = null;

/** 懒初始化 Supabase 客户端——环境变量没配时返回 null,不抛错 */
export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  try {
    const env = loadEnv();
    if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) return null;
    client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    return client;
  } catch {
    return null;
  }
}

/** 为向后兼容保留,内部调用 getSupabase() */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    const s = getSupabase();
    if (!s) throw new Error("Supabase 未配置——请将 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY 写入 .env.local");
    return (s as unknown as Record<string | symbol, unknown>)[prop];
  },
});
