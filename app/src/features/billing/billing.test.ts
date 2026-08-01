import { describe, it, expect } from "vitest";
import { billingRepository, findBillingByPatient, calcBalance } from "./billing.repository";
import { buildBillingEvent } from "./useBilling";
import type { BillingRecordEntity } from "./billing.repository";

function record(overrides: Partial<BillingRecordEntity>): BillingRecordEntity {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date(),
    patientId: "p1",
    orgId: "00000000-0000-4000-8000-0000000000f0",
    type: "充值",
    amount: 1000,
    note: "现金充值",
    ...overrides,
  };
}

describe("billingRepository", () => {
  it("create 后可按 patientId 查回", async () => {
    const created = await billingRepository.create({
      patientId: "p99", orgId: "00000000-0000-4000-8000-0000000000f0",
      type: "充值", amount: 500, note: "测试充值",
    });
    expect(created.id).toBeTruthy();
    const found = await findBillingByPatient("p99");
    expect(found).toHaveLength(1);
  });

  it("delete 可删除记录", async () => {
    const created = await billingRepository.create({
      patientId: "p98", orgId: "00000000-0000-4000-8000-0000000000f0",
      type: "消费", amount: 200, note: "治疗消费",
    });
    await billingRepository.remove(created.id);
    const found = await findBillingByPatient("p98");
    expect(found).toHaveLength(0);
  });
});

describe("calcBalance", () => {
  it("充值-消费=余额", () => {
    const records = [
      record({ type: "充值", amount: 1000, note: "充10次" }),
      record({ type: "消费", amount: 150, note: "第1次" }),
      record({ type: "消费", amount: 150, note: "第2次" }),
    ];
    const b = calcBalance(records);
    expect(b.balance).toBe(700);
    expect(b.totalRecharge).toBe(1000);
    expect(b.totalSpent).toBe(300);
  });

  it("计次卡扣对次数", () => {
    const records = [
      record({ type: "充值", amount: 3000, sessions: 20, note: "20次卡" }),
      record({ type: "消费", amount: 150, sessions: 1, note: "扣1次" }),
      record({ type: "消费", amount: 150, sessions: 1, note: "扣1次" }),
    ];
    const b = calcBalance(records);
    expect(b.totalSessions).toBe(20);
    expect(b.usedSessions).toBe(2);
    expect(b.sessionBalance).toBe(18);
  });
});

describe("buildBillingEvent", () => {
  it("消费生成 billing.consumed 事件", () => {
    const ev = buildBillingEvent(
      { type: "消费", patientId: "p1", amount: 200, encounterId: "e1" },
      "b_1",
    );
    expect(ev).not.toBeNull();
    expect(ev!.type).toBe("billing.consumed");
    expect((ev as Extract<typeof ev, { type: "billing.consumed" }>).amount).toBe(200);
    expect((ev as Extract<typeof ev, { type: "billing.consumed" }>).encounterId).toBe("e1");
  });

  it("充值生成 billing.recharged 事件", () => {
    const ev = buildBillingEvent(
      { type: "充值", patientId: "p1", amount: 500, sessions: 5 },
      "b_2",
    );
    expect(ev).not.toBeNull();
    expect(ev!.type).toBe("billing.recharged");
    expect((ev as Extract<typeof ev, { type: "billing.recharged" }>).amount).toBe(2500);
  });

  it("退费不生成事件", () => {
    const ev = buildBillingEvent(
      { type: "退费", patientId: "p1", amount: 100 },
      "b_3",
    );
    expect(ev).toBeNull();
  });

  it("金额 <= 0 不生成事件", () => {
    expect(buildBillingEvent({ type: "充值", patientId: "p1", amount: 0 }, "b_4")).toBeNull();
    expect(buildBillingEvent({ type: "消费", patientId: "p1", amount: -50 }, "b_5")).toBeNull();
  });
});
