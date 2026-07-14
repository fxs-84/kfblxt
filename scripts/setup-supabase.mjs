#!/usr/bin/env node
/**
 * ANRM kfblxt — Supabase 一键迁移脚本
 *
 * 用法:
 *   1. 拿到 Supabase 项目的 "Direct connection" 串(postgres://...)
 *   2. 把它放进 app/.env.local 作为 SUPABASE_DB_URL
 *   3. 跑:npm run setup:supabase
 *
 * 脚本会:
 *   - 顺序跑 app/supabase/migrations/0001..0004.sql
 *   - 每跑完一个文件打印 Success + 耗时
 *   - 任一文件失败立即停止并打印友好诊断
 *   - 已跑过的文件视情况幂等(create table if not exists / exception when duplicate_object)
 *
 * 该脚本只连接一次 + 关事务一次,连接的 server 字段必须能解析
 * 到 Supabase Postgres(可能是 db.<ref>.supabase.co 或
 * aws-<region>.pooler.supabase.com 之一)。
 */

import { Client } from "pg";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(REPO_ROOT, "app", "supabase", "migrations");

const COLOR = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

function log(color, ...args) {
  console.log(color, ...args, COLOR.reset);
}

async function loadEnv() {
  const envPath = path.join(REPO_ROOT, "app", ".env.local");
  const envExamplePath = path.join(REPO_ROOT, "app", ".env.example");
  let raw;
  try {
    raw = await fs.readFile(envPath, "utf8");
  } catch {
    log(COLOR.red, `✗ 找不到 ${envPath}`);
    log(COLOR.yellow, `  复制 ${envExamplePath} → ${envPath} 后填入:`);
    log(COLOR.gray, "    VITE_SUPABASE_URL=https://xxxx.supabase.co");
    log(COLOR.gray, "    VITE_SUPABASE_ANON_KEY=sb_publishable_...");
    log(COLOR.gray, "    SUPABASE_DB_URL=postgres://postgres:PASSWORD@db.xxxx.supabase.co:5432/postgres");
    process.exit(1);
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m && !m[1].startsWith("#")) {
      process.env[m[1]] = m[2];
    }
  }
}

async function main() {
  await loadEnv();

  const conn = process.env.SUPABASE_DB_URL;
  if (!conn) {
    log(COLOR.red, "✗ .env.local 里没填 SUPABASE_DB_URL");
    log(COLOR.yellow, "  步骤:");
    log(COLOR.gray, "    1. 浏览器进 supabase.com/dashboard → 进您项目");
    log(COLOR.gray, "    2. 左侧 Settings(齿轮) → Database");
    log(COLOR.gray, "    3. Connection string 区域 → URI 一行整段复制");
    log(COLOR.gray, "    4. 形如:postgres://postgres.PROJECT_REF:PASSWORD@aws-X-REGION.pooler.supabase.com:6543/postgres");
    log(COLOR.gray, "    5. 粘进 app/.env.local 的 SUPABASE_DB_URL= 后面");
    log(COLOR.gray, "    6. 重跑:npm run setup:supabase");
    process.exit(1);
  }

  log(COLOR.cyan, "▶ 连 Supabase Postgres...");
  const client = new Client({
    connectionString: conn,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  try {
    await client.connect();
    const v = await client.query("SELECT current_database() AS db, current_user AS u, version() AS v");
    log(COLOR.green, "✓ 连上");
    log(COLOR.gray, `  db=${v.rows[0].db}  user=${v.rows[0].u}`);
  } catch (e) {
    log(COLOR.red, "✗ 连不上 Postgres");
    log(COLOR.yellow, "  错误: " + (e.message || e.code));
    log(COLOR.gray, "  检查:");
    log(COLOR.gray, "    1. .env.local 里 SUPABASE_DB_URL 是不是您 Supabase 'Connection string' 整段粘贴");
    log(COLOR.gray, "    2. 您的网络到 db.<ref>.supabase.co:5432 通不通(端口可能被防火墙挡)");
    log(COLOR.gray, "    3. 是不是错用了 'Transaction pooler' 端口 + 事务模式 — 给 DDL 改用 'Direct connection' 或 'Session pooler'");
    process.exit(1);
  }

  const migrationFiles = (await fs.readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  log(COLOR.cyan, `\n▶ 找到 ${migrationFiles.length} 个迁移:`);
  for (const f of migrationFiles) {
    log(COLOR.gray, "    - " + f);
  }
  log(COLOR.cyan, "");

  let totalDuration = 0;
  for (const file of migrationFiles) {
    const filepath = path.join(MIGRATIONS_DIR, file);
    const sql = await fs.readFile(filepath, "utf8");
    log(COLOR.cyan, `▶ 跑 ${file} (${(sql.length / 1024).toFixed(1)} KB)...`);
    const start = Date.now();
    try {
      await client.query(sql);
      const dt = Date.now() - start;
      totalDuration += dt;
      log(COLOR.green, `  ✓ Success (${dt} ms)`);
    } catch (e) {
      const dt = Date.now() - start;
      log(COLOR.red, `  ✗ 失败 (${dt} ms)`);
      log(COLOR.red, `  错误: ${e.message?.split("\n")[0] || e.code || e}`);
      log(COLOR.yellow, `  诊断: 第 ${(e.line || 0)} 行附近出问题`);
      log(COLOR.yellow, `  提示:`);
      log(COLOR.gray, `    - 单句复制有问题的行去 Supabase SQL Editor 跑一次,看错误更精确`);
      log(COLOR.gray, `    - 'create type/enum/extension' 已存在 → 通常无害,删除该句重跑`);
      log(COLOR.gray, `    - 'syntax error at or near' → Postgres 版本对 DEFAULT 表达式策略不同,改用 jsonb_build_array() 之类`);
      log(COLOR.gray, `    - 'permission denied' → 用 service_role 密钥而非常用 DB 密码(在 Settings → API → service_role)`);
      process.exit(1);
    }
  }

  log(COLOR.green, `\n✓ 全部 ${migrationFiles.length} 个迁移已完成。${totalDuration} ms 总耗时。`);
  log(COLOR.cyan, "\n下一步:");
  log(COLOR.gray, "  - 在 Supabase 控制台 Table Editor 应能看到 14 张表");
  log(COLOR.gray, "  - 重启您的 app:cd app && npm run dev");
  log(COLOR.gray, "  - 在 Settings → API 拿 'service_role' key → 放进 GitHub repo secrets → 后端 RLS 写路径开");

  await client.end();
}

main().catch((e) => {
  log(COLOR.red, "✗ 致命:", e.message || e);
  process.exit(1);
});
