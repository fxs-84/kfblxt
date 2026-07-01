import { z } from "zod";

/**
 * 在系统边界校验环境变量。缺失即启动失败,避免运行期才暴露配置错误。
 */
const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url("VITE_SUPABASE_URL 必须是合法 URL"),
  VITE_SUPABASE_ANON_KEY: z.string().min(1, "VITE_SUPABASE_ANON_KEY 不能为空"),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, unknown> = import.meta.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`环境变量校验失败:\n${issues}\n请参考 .env.example 配置 .env.local`);
  }
  return result.data;
}
