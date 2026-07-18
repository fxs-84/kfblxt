/**
 * Schema 自检 — 启动时检测关键表/列是否在 Supabase 中存在。
 *
 * 失败时返回缺失列清单,UI 层用此清单决定是否弹出"请先跑迁移"提示页。
 *
 * 设计要点:
 *  - 只读 information_schema.columns,不会修改任何数据
 *  - 列出每个缺失列所属的表 + SQL 修复片段(可直接复制)
 *  - 一旦全部就绪,就不再打扰
 */

import { getSupabase } from "./supabase";

export interface MissingColumn {
  table: string;
  column: string;
  fixSql: string;
}

/** 当前应用依赖的关键列清单。如新功能加列,在这里登记。 */
const REQUIRED_COLUMNS: { table: string; column: string; fixSql: string }[] = [
  // 0007
  { table: "encounters", column: "amount", fixSql: "alter table public.encounters add column if not exists amount numeric(10,2) default 0;" },
  { table: "treatment_plans", column: "frequency", fixSql: "alter table public.treatment_plans add column if not exists frequency text;" },
  { table: "treatment_plans", column: "duration", fixSql: "alter table public.treatment_plans add column if not exists duration text;" },
  { table: "treatment_plans", column: "intervention_doses", fixSql: "alter table public.treatment_plans add column if not exists intervention_doses jsonb default '{}'::jsonb;" },
];

/** 从 Postgres information_schema 一次性查全部必要列。 */
async function fetchExistingColumns(tableNames: string[]): Promise<Set<string>> {
  const sb = getSupabase();
  if (!sb) return new Set();
  const { data, error } = await sb
    .from("information_schema.columns")
    .select("table_name, column_name")
    .in("table_name", tableNames)
    .eq("table_schema", "public");
  if (error || !data) return new Set();
  return new Set(data.map((r) => `${r.table_name}.${r.column_name}`));
}

/** 检测并返回缺失列清单。Supabase 未配置或离线时返回空数组(不打扰本地模式)。 */
export async function checkSchemaHealth(): Promise<MissingColumn[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const tableNames = Array.from(new Set(REQUIRED_COLUMNS.map((c) => c.table)));
  const existing = await fetchExistingColumns(tableNames);

  return REQUIRED_COLUMNS
    .filter((c) => !existing.has(`${c.table}.${c.column}`))
    .map((c) => ({ table: c.table, column: c.column, fixSql: c.fixSql }));
}

/** 把多个缺失列的修复 SQL 拼成一段可直接跑的脚本。 */
export function buildFixScript(missing: MissingColumn[]): string {
  if (missing.length === 0) return "";
  const unique = Array.from(new Set(missing.map((m) => m.fixSql)));
  return [...unique, "NOTIFY pgrst, 'reload schema';"].join("\n");
}