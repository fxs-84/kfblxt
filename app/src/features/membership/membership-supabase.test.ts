import { describe, it, expect, beforeEach } from "vitest";

const ORG = "00000000-0000-4000-8000-0000000000f0";
const PATIENT_A = "aaaaaaaa-0000-4000-8000-000000000001";
const PATIENT_B = "bbbbbbbb-0000-4000-8000-000000000002";

async function clearLocal() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem("anrm:membership-memberships");
  localStorage.removeItem("anrm:membership-logs");
  localStorage.removeItem("anrm:membership-redemptions");
}

// 暂时只 import 无 Supabase 路径,fork test = 不引入 supabase.ts 来跑;
// 通过规则仓库的纯本地路径验证这些函数本身正常,仅做单元骨架。
// 真 Supabase 路径需要外部 Postgres / anon key,后续集成测试再做。

describe("membership localStorage primitives (回归保护)", () => {
  beforeEach(async () => {
    await clearLocal();
  });

  it("getOrCreateMembership 首次创建,二次复用", async () => {
    const { getOrCreateMembership } = await import("./rule.repository");
    const a1 = await getOrCreateMembership(PATIENT_A);
    const a2 = await getOrCreateMembership(PATIENT_A);
    expect(a1.patientId).toBe(PATIENT_A);
    expect(a2.patientId).toBe(PATIENT_A);
    expect(a1.points).toBe(0);
    expect(a2.points).toBe(0);
  });

  it("getOrCreateMembership 两个 patient 互不干扰", async () => {
    const { getOrCreateMembership } = await import("./rule.repository");
    await getOrCreateMembership(PATIENT_A);
    await getOrCreateMembership(PATIENT_B);
    const a = await getOrCreateMembership(PATIENT_A);
    const b = await getOrCreateMembership(PATIENT_B);
    expect(a.patientId).toBe(PATIENT_A);
    expect(b.patientId).toBe(PATIENT_B);
  });

  it("appendLog + getRecentLogs 时间倒序", async () => {
    const { appendLog, getRecentLogs } = await import("./rule.repository");
    const logA = {
      id: "log-1",
      patientId: PATIENT_A,
      delta: 10,
      balanceAfter: 10,
      reason: "test 1",
      ruleId: null,
      triggerType: null,
      refType: null,
      refId: null,
      operatorId: "op-1",
      createdAt: new Date().toISOString(),
      deletedAt: null,
    };
    const logB = {
      ...logA,
      id: "log-2",
      reason: "test 2",
      createdAt: new Date(Date.now() + 1000).toISOString(),
    };
    await appendLog(logA);
    await appendLog(logB);
    const recent = await getRecentLogs(PATIENT_A, 10);
    expect(recent.length).toBeGreaterThanOrEqual(2);
    const idxA = recent.findIndex((l) => l.id === "log-1");
    const idxB = recent.findIndex((l) => l.id === "log-2");
    expect(idxB).toBeLessThan(idxA);
  });

  it("markOrphaned 级联软删保留原始记录但不再返回", async () => {
    const { getOrCreateMembership, appendLog, markMembershipsOrphanedByPatient, markLogsOrphanedByPatient, findAllMemberships, findAllLogs } = await import("./rule.repository");
    await getOrCreateMembership(PATIENT_A);
    await appendLog({
      id: "log-cascade-1",
      patientId: PATIENT_A,
      delta: 5,
      balanceAfter: 5,
      reason: "cascade test",
      ruleId: null,
      triggerType: null,
      refType: null,
      refId: null,
      operatorId: "op-1",
      createdAt: new Date().toISOString(),
      deletedAt: null,
    });
    const m1 = await markMembershipsOrphanedByPatient(PATIENT_A);
    const l1 = await markLogsOrphanedByPatient(PATIENT_A);
    expect(m1).toBeGreaterThanOrEqual(1);
    expect(l1).toBeGreaterThanOrEqual(1);

    // 级联后:findAll* 视图已不再返回该客户相关记录(软删生效)
    const ms = await findAllMemberships();
    expect(ms.find((m) => m.patientId === PATIENT_A)).toBeUndefined();
    const ls = await findAllLogs();
    expect(ls.find((l) => l.patientId === PATIENT_A)).toBeUndefined();
  });

  it("redemption round-trip + 级联软删", async () => {
    const { createRedemption, findRedemptionsByPatient, markRedemptionsOrphanedByPatient } = await import("./rule.repository");
    const r = {
      id: "r-1",
      patientId: PATIENT_A,
      rewardId: "reward_elastics",
      rewardName: "弹力带训练包",
      pointsCost: 300,
      status: "pending" as const,
      notes: null,
      operatorId: "op-1",
      createdAt: new Date().toISOString(),
      fulfilledAt: null,
      cancelledAt: null,
      deletedAt: null,
    };
    await createRedemption(r);
    const list = await findRedemptionsByPatient(PATIENT_A);
    expect(list.some((x) => x.id === "r-1")).toBe(true);

    const marked = await markRedemptionsOrphanedByPatient(PATIENT_A);
    expect(marked).toBeGreaterThanOrEqual(1);
    const after = await findRedemptionsByPatient(PATIENT_A);
    expect(after.find((x) => x.id === "r-1")).toBeUndefined();
  });
});
