/// <reference types="node" />
/**
 * 跨测试套件环境清理 — Supabase 双模式分发器的"无 env 走 fallback"假设。
 *
 * 用户的 .env.local 在 dev 模式下被 Vite 加载,会被 vitest 的 jsdom 共享进
 * globalThis.process.env 或 import.meta.env。Supabase 模块一旦拿到 env
 * 就走远端分支,原 fallback 测试就会出现"试图连接 Supabase 但 key 不匹配"
 * 的失败。本文件在每个测试前清掉 VITE_SUPABASE_* 这两个变量,让回归测试稳定。
 */
import { beforeAll, afterAll } from "vitest";

const ENV_KEYS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_SUPABASE_SERVICE_KEY",
] as const;

let backup: Record<string, string | undefined> = {};

beforeAll(() => {
  // 备份原始值(避免把用户真实配置清掉)
  for (const k of ENV_KEYS) {
    backup[k] = process.env[k];
    delete process.env[k];
  }
});

afterAll(() => {
  // 测试结束还原
  for (const k of ENV_KEYS) {
    if (backup[k] !== undefined) process.env[k] = backup[k];
    else delete process.env[k];
  }
});
