import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env";

/**
 * 单例 Supabase 客户端。多租户隔离由数据库 RLS 承担 —
 * 前端仅持匿名公钥,所有跨机构越权在 Postgres 层被拒绝。
 */
const env = loadEnv();

export const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
