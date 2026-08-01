/**
 * 会员积分规则一次性迁移 — 把历史「encounter.amount」字段按 trigger 重路由。
 *
 * 为什么需要:旧版本一个 encounter.amount 字段同时服务消费和充值场景,UI 标签是
 * 「消费/充值金额」误导用户;实际 buildContext 只在 encounter.closed/billing.consumed
 * 注入,导致用户为充值规则配的 encounter.amount≥500 永远 false。
 *
 * 修复策略:拆分 encounter.amount / recharge.amount 两个独立字段。
 * - trigger === "billing.recharged" + field === "encounter.amount" → 改 recharge.amount
 * - 其他 trigger 保持 encounter.amount(本来就是消费场景用的)
 *
 * 幂等:再次执行时所有规则已迁完,跳过。
 */
import { findAllRules, updateRule } from "./rule.repository";
import type { PointsRule, RuleCondition } from "./models";

const MIGRATION_KEY = "anrm:migration:condition-fields-split";

interface MigrationResult {
  scanned: number;
  migrated: number;
  skipped: number;
  errors: number;
  /** 是否已被标记完成(幂等保护) */
  alreadyDone: boolean;
}

export async function migrateConditionFieldsToSplit(): Promise<MigrationResult> {
  const alreadyDone =
    typeof localStorage !== "undefined" && localStorage.getItem(MIGRATION_KEY) === "1";

  const rules = await findAllRules();
  const result: MigrationResult = {
    scanned: rules.length,
    migrated: 0,
    skipped: 0,
    errors: 0,
    alreadyDone,
  };

  for (const rule of rules) {
    if (!needsMigration(rule)) {
      result.skipped++;
      continue;
    }
    if (alreadyDone) {
      // 防御性:已标记完成但仍有遗留(开发期手改本地数据),仍然跑一次兜底
    }
    const next = remapRule(rule);
    try {
      await updateRule(rule.id, { conditions: next.conditions });
      result.migrated++;
    } catch (e) {
      console.error("[membership-migrations] updateRule failed:", rule.id, e);
      result.errors++;
    }
  }

  if (!alreadyDone && typeof localStorage !== "undefined") {
    localStorage.setItem(MIGRATION_KEY, "1");
    result.alreadyDone = true;
  }
  return result;
}

function needsMigration(rule: PointsRule): boolean {
  if (rule.trigger !== "billing.recharged") return false;
  return rule.conditions.some((c: RuleCondition) => c.field === "encounter.amount");
}

function remapRule(rule: PointsRule): PointsRule {
  return {
    ...rule,
    conditions: rule.conditions.map((c: RuleCondition) =>
      c.field === "encounter.amount"
        ? { ...c, field: "recharge.amount" as RuleCondition["field"] }
        : c,
    ),
  };
}

/** 测试/调试用 — 清空迁移标记,允许重跑 */
export function resetConditionFieldsSplitMigration(): void {
  if (typeof localStorage !== "undefined") localStorage.removeItem(MIGRATION_KEY);
}