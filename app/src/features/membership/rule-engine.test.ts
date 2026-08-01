import { describe, it, expect, beforeEach } from "vitest";
import { processEvent } from "./rule-engine";
import {
  createRule,
  findAllLogs,
  localFindAllRules,
  localUpdateRule,
} from "./rule.repository";
import { migrateConditionFieldsToSplit, resetConditionFieldsSplitMigration } from "./migrations";
import type { PointsRule } from "./models";

const PATIENT = "patient_recharge_test";

function resetStorage(): void {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("anrm_membership-")) localStorage.removeItem(key);
  }
  resetConditionFieldsSplitMigration();
}

beforeEach(() => {
  resetStorage();
});

function makeRechargeRule(overrides: Partial<PointsRule> = {}): PointsRule {
  return {
    id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: "充值满500奖励",
    enabled: true,
    builtin: false,
    trigger: "billing.recharged",
    conditions: [{ field: "recharge.amount", op: "gte", value: 500 }],
    action: { kind: "award_fixed", points: 100, reason: "充值满500奖励" },
    cooldownDays: 0,
    maxPerPatient: 0,
    priority: 10,
    order: 1,
    validFrom: null,
    validUntil: null,
    ...overrides,
  };
}

function makeConsumeRule(overrides: Partial<PointsRule> = {}): PointsRule {
  return {
    id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: "消费满200奖励",
    enabled: true,
    builtin: false,
    trigger: "billing.consumed",
    conditions: [{ field: "encounter.amount", op: "gte", value: 200 }],
    action: { kind: "award_fixed", points: 50, reason: "消费满200奖励" },
    cooldownDays: 0,
    maxPerPatient: 0,
    priority: 10,
    order: 1,
    validFrom: null,
    validUntil: null,
    ...overrides,
  };
}

describe("rule-engine 充值/消费条件分离", () => {
  it("billing.recharged + recharge.amount≥500 触发固定积分", async () => {
    await createRule(makeRechargeRule());

    await processEvent({
      type: "billing.recharged",
      patientId: PATIENT,
      billingId: "b_1",
      amount: 500,
      createdAt: new Date(),
    });

    const logs = await findAllLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].delta).toBe(100);
    expect(logs[0].reason).toBe("充值满500奖励");
  });

  it("billing.recharged + recharge.amount<500 不触发", async () => {
    await createRule(makeRechargeRule());

    await processEvent({
      type: "billing.recharged",
      patientId: PATIENT,
      billingId: "b_2",
      amount: 499,
      createdAt: new Date(),
    });

    expect(await findAllLogs()).toHaveLength(0);
  });

  it("billing.recharged 使用 encounter.amount 条件时不触发 — 证明字段已拆分", async () => {
    await createRule(
      makeRechargeRule({
        conditions: [{ field: "encounter.amount", op: "gte", value: 500 }],
      }),
    );

    await processEvent({
      type: "billing.recharged",
      patientId: PATIENT,
      billingId: "b_3",
      amount: 500,
      createdAt: new Date(),
    });

    expect(await findAllLogs()).toHaveLength(0);
  });

  it("billing.consumed + encounter.amount≥200 仍正常触发", async () => {
    await createRule(makeConsumeRule());

    await processEvent({
      type: "billing.consumed",
      patientId: PATIENT,
      billingId: "b_4",
      amount: 200,
      createdAt: new Date(),
    });

    const logs = await findAllLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].delta).toBe(50);
    expect(logs[0].reason).toBe("消费满200奖励");
  });

  it("billing.recharged + recharge.amount 支持按比例返积分", async () => {
    await createRule(
      makeRechargeRule({
        conditions: [{ field: "recharge.amount", op: "gte", value: 100 }],
        action: { kind: "award_ratio", pointsPerYuan: 1, reason: "充值1元1积分" },
      }),
    );

    await processEvent({
      type: "billing.recharged",
      patientId: PATIENT,
      billingId: "b_5",
      amount: 300,
      createdAt: new Date(),
    });

    const logs = await findAllLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].delta).toBe(300);
  });
});

describe("rule-engine 其他触发器覆盖", () => {
  it("encounter.closed 触发固定积分", async () => {
    await createRule({
      ...makeRechargeRule(),
      id: "rule_encounter",
      trigger: "encounter.closed",
      conditions: [{ field: "encounter.amount", op: "gte", value: 100 }],
      action: { kind: "award_fixed", points: 30, reason: "就诊奖励" },
    });

    await processEvent({
      type: "encounter.closed",
      patientId: PATIENT,
      encounterId: "e_1",
      amount: 200,
      createdAt: new Date(),
    });

    const logs = await findAllLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].delta).toBe(30);
    expect(logs[0].triggerType).toBe("encounter.closed");
  });

  it("patient.created 触发注册奖励", async () => {
    await createRule({
      ...makeRechargeRule(),
      id: "rule_register",
      trigger: "patient.created",
      conditions: [],
      action: { kind: "award_fixed", points: 10, reason: "注册奖励" },
      maxPerPatient: 1,
    });

    await processEvent({
      type: "patient.created",
      patientId: PATIENT,
      createdAt: new Date(),
    });

    expect(await findAllLogs()).toHaveLength(1);
  });

  it("cooldown 阻止短期内重复触发", async () => {
    await createRule({
      ...makeRechargeRule(),
      id: "rule_cooldown",
      cooldownDays: 1,
    });

    await processEvent({
      type: "billing.recharged",
      patientId: PATIENT,
      billingId: "b_cd_1",
      amount: 500,
      createdAt: new Date(),
    });
    await processEvent({
      type: "billing.recharged",
      patientId: PATIENT,
      billingId: "b_cd_2",
      amount: 500,
      createdAt: new Date(),
    });

    expect(await findAllLogs()).toHaveLength(1);
  });

  it("maxPerPatient 限制每人最多触发次数", async () => {
    await createRule({
      ...makeRechargeRule(),
      id: "rule_max",
      maxPerPatient: 1,
      cooldownDays: 0,
    });

    await processEvent({
      type: "billing.recharged",
      patientId: PATIENT,
      billingId: "b_max_1",
      amount: 500,
      createdAt: new Date(),
    });
    await processEvent({
      type: "billing.recharged",
      patientId: PATIENT,
      billingId: "b_max_2",
      amount: 500,
      createdAt: new Date(),
    });

    expect(await findAllLogs()).toHaveLength(1);
  });

  it("条件不满足时不触发", async () => {
    await createRule(makeRechargeRule());

    await processEvent({
      type: "billing.recharged",
      patientId: PATIENT,
      billingId: "b_no",
      amount: 100,
      createdAt: new Date(),
    });

    expect(await findAllLogs()).toHaveLength(0);
  });
});

describe("condition-fields 迁移", () => {
  it("billing.recharged + encounter.amount 的老规则被迁到 recharge.amount", async () => {
    const rule = makeRechargeRule({
      conditions: [{ field: "encounter.amount", op: "gte", value: 500 }],
    });
    await createRule(rule);

    const result = await migrateConditionFieldsToSplit();
    expect(result.scanned).toBeGreaterThanOrEqual(1);
    expect(result.migrated).toBe(1);

    const updated = localFindAllRules().find(r => r.id === rule.id);
    expect(updated).toBeDefined();
    expect(updated!.conditions[0].field).toBe("recharge.amount");

    // 迁移后充值 500 能触发
    await processEvent({
      type: "billing.recharged",
      patientId: PATIENT,
      billingId: "b_migrate",
      amount: 500,
      createdAt: new Date(),
    });
    expect(await findAllLogs()).toHaveLength(1);
  });

  it("消费规则不会被迁移", async () => {
    const rule = makeConsumeRule();
    await createRule(rule);

    const result = await migrateConditionFieldsToSplit();
    expect(result.migrated).toBe(0);

    const updated = localFindAllRules().find(r => r.id === rule.id);
    expect(updated!.conditions[0].field).toBe("encounter.amount");
  });

  it("迁移是幂等的", async () => {
    const rule = makeRechargeRule({
      conditions: [{ field: "encounter.amount", op: "gte", value: 500 }],
    });
    await createRule(rule);

    const first = await migrateConditionFieldsToSplit();
    expect(first.migrated).toBe(1);

    // 手动把字段改回 encounter.amount 模拟"又变旧"
    localUpdateRule(rule.id, {
      conditions: [{ field: "encounter.amount", op: "gte", value: 500 }],
    });

    const second = await migrateConditionFieldsToSplit();
    // 本地标记已存在,防御性仍然再跑一遍兜底
    expect(second.migrated).toBe(1);
  });
});