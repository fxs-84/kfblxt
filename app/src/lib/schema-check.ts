/**
 * Schema 自检 — 启动时检测关键表/列是否在 Supabase 中存在。
 *
 * 列清单来源:scripts/scan-required-columns.mjs 自动扫描 src/features/**\*-supabase.ts 生成。
 * 这样我加新写入列时,清单自动覆盖,不需要手动维护。
 *
 * 失败时返回缺失列清单,UI 层用此清单决定是否弹出"请先跑迁移"提示页。
 */

import { getSupabase } from "./supabase";
import { REQUIRED_COLUMNS } from "./required-columns.generated";

export interface MissingColumn {
  table: string;
  column: string;
  fixSql: string;
}

/** 单列的修复 SQL 模板。每次新列请同步在迁移文件里登记。 */
const FIX_SQL: Record<string, string> = {
  // 0007_fix_schema_drift.sql
  "encounters.amount": "alter table public.encounters add column if not exists amount numeric(10,2) default 0;",
  "treatment_plans.frequency": "alter table public.treatment_plans add column if not exists frequency text;",
  "treatment_plans.duration": "alter table public.treatment_plans add column if not exists duration text;",
  "treatment_plans.intervention_doses": "alter table public.treatment_plans add column if not exists intervention_doses jsonb default '{}'::jsonb;",
};

/** 默认 fix 模板(没登记过的列) */
const DEFAULT_FIX = (table: string, column: string) =>
  `alter table public.${table} add column if not exists ${column} text; -- TODO: 调整类型`;

function fixSqlFor(table: string, column: string): string {
  return FIX_SQL[`${table}.${column}`] ?? DEFAULT_FIX(table, column);
}

/** 从 Postgres information_schema 一次性查全部必要列。 */
async function fetchExistingColumns(tableNames: string[]): Promise<Set<string>> {
  const sb = getSupabase();
  if (!sb) return new Set();
  // 用 RPC 或直接查 information_schema。前端通常没权限建 RPC,
  // 改用 :information_schema.columns 这种查询方式不直接支持,所以借助 Supabase 暴露的视图。
  // 实际方案:对每个表做一次 select with limit 0,触发 PostgREST 报 schema 错误信息。
  // 但更简单的做法:逐表 .from(table).select('col1,col2').limit(0) — 如果列不存在会抛错。
  // 这里取折中:information_schema 在 Supabase 默认开放给 authenticated 角色,
  // 如果该角色没权限,就退化为空集合(用户看不到提示,但功能也不受影响)。
  try {
    const { data, error } = await sb
      .from("information_schema.columns")
      .select("table_name, column_name")
      .in("table_name", tableNames)
      .eq("table_schema", "public");
    if (error || !data) return new Set();
    return new Set(data.map((r: { table_name: string; column_name: string }) =>
      `${r.table_name}.${r.column_name}`,
    ));
  } catch {
    return new Set();
  }
}

/** 检测并返回缺失列清单。Supabase 未配置或离线时返回空数组(不打扰本地模式)。 */
export async function checkSchemaHealth(): Promise<MissingColumn[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const tableNames = Array.from(new Set(REQUIRED_COLUMNS.map((c) => c.table)));
  const existing = await fetchExistingColumns(tableNames);

  return REQUIRED_COLUMNS
    .filter((c) => !existing.has(`${c.table}.${c.column}`))
    .map((c) => ({ table: c.table, column: c.column, fixSql: fixSqlFor(c.table, c.column) }));
}

/** 把多个缺失列的修复 SQL 拼成一段可直接跑的脚本。 */
export function buildFixScript(missing: MissingColumn[]): string {
  if (missing.length === 0) return "";
  const unique = Array.from(new Set(missing.map((m) => m.fixSql)));
  return [...unique, "NOTIFY pgrst, 'reload schema';"].join("\n");
}