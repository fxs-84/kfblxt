import { describe, it, expect, beforeEach } from "vitest";
import {
  findAllMemberships,
  findAllLogs,
  findAllRedemptions,
  appendLog,
  createRedemption,
  markMembershipsOrphanedByPatient,
  markLogsOrphanedByPatient,
  markRedemptionsOrphanedByPatient,
  getRecentLogs,
  getOrCreateMembership,
} from "./rule.repository";
import type { PointsLog, Redemption } from "./models";

const PATIENT_KEEP = "p_keep";
const PATIENT_DELETE = "p_delete";

// 每次用例前重置 localStorage,保证隔离。
function resetStorage(): void {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("anrm_membership-")) localStorage.removeItem(key);
  }
}

// 在 import 顶层仓储已 ensureSeeded("rules") / ("tiers") / ("reward-products"),
// 上面 resetStorage 不会清掉这些 seed,因为前缀在 PREFIX 内部;不影响本测试关心的三张表。
beforeEach(() => {
  resetStorage();
});

describe("patient 删除级联软删 — display 侧自动消失", () => {
  it("markMembershipsOrphanedByPatient:findAllMemberships 不再返回该 patient 行,但 localStorage 仍保留", async () => {
    // Arrange — 给两个客户各建一条会员档案
    await getOrCreateMembership(PATIENT_KEEP);
    await getOrCreateMembership(PATIENT_DELETE);

    expect(await findAllMemberships()).toHaveLength(2);

    // Act
    const count = await markMembershipsOrphanedByPatient(PATIENT_DELETE);

    // Assert — 返回条数正确
    expect(count).toBe(1);

    // findAll* 已过滤 deletedAt:展示侧不显示幽灵行
    const remain = await findAllMemberships();
    expect(remain).toHaveLength(1);
    expect(remain[0].patientId).toBe(PATIENT_KEEP);

    // localStorage 数据没丢,带 deletedAt 标记作审计证据
    const raw = JSON.parse(localStorage.getItem("anrm_membership-memberships") ?? "[]");
    const deletedRow = raw.find((m: { patientId: string }) => m.patientId === PATIENT_DELETE);
    expect(deletedRow).toBeDefined();
    expect(deletedRow.deletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("markLogsOrphanedByPatient:findAllLogs / getRecentLogs 不再返回该 patient 的流水", async () => {
    // Arrange
    const ts = "2026-07-11T12:00:00.000Z";
    const make = (overrides: Partial<PointsLog>): PointsLog => ({
      id: `log_${Math.random().toString(36).slice(2)}`,
      patientId: PATIENT_DELETE,
      delta: 10,
      balanceAfter: 10,
      reason: "test",
      ruleId: null,
      triggerType: "manual",
      refType: "manual",
      refId: null,
      operatorId: "u1",
      createdAt: ts,
      ...overrides,
    });
    await appendLog(make({ patientId: PATIENT_KEEP, id: "log_keep_1" }));
    await appendLog(make({ id: "log_del_1" }));
    await appendLog(make({ id: "log_del_2" }));

    expect(await findAllLogs()).toHaveLength(3);

    // Act
    const count = await markLogsOrphanedByPatient(PATIENT_DELETE);

    // Assert
    expect(count).toBe(2);
    expect(await findAllLogs()).toHaveLength(1);
    expect((await getRecentLogs(PATIENT_DELETE)).length).toBe(0);
  });

  it("markRedemptionsOrphanedByPatient:findAllRedemptions 不再返回该 patient 的订单", async () => {
    // Arrange
    const baseRedemption = {
      id: "",
      patientId: PATIENT_DELETE,
      rewardId: "reward_elastics",
      rewardName: "弹力带训练包",
      pointsCost: 300,
      status: "pending" as const,
      notes: null,
      operatorId: "u1",
      createdAt: new Date().toISOString(),
      fulfilledAt: null,
      cancelledAt: null,
    };
    await createRedemption({ ...baseRedemption, id: "r_keep", patientId: PATIENT_KEEP });
    await createRedemption({ ...baseRedemption, id: "r_del_1" });
    await createRedemption({ ...baseRedemption, id: "r_del_2" });

    const beforeAll: Redemption[] = await findAllRedemptions();
    expect(beforeAll).toHaveLength(3);

    // Act
    const count = await markRedemptionsOrphanedByPatient(PATIENT_DELETE);

    // Assert
    expect(count).toBe(2);
    const after = await findAllRedemptions();
    expect(after).toHaveLength(1);
    expect(after[0].patientId).toBe(PATIENT_KEEP);
  });

  it("重复 cascade 调用是幂等的 — 第二次调用不再重复打 deletedAt", async () => {
    await getOrCreateMembership(PATIENT_DELETE);

    const first = await markMembershipsOrphanedByPatient(PATIENT_DELETE);
    const second = await markMembershipsOrphanedByPatient(PATIENT_DELETE);

    expect(first).toBe(1);
    expect(second).toBe(0); // 已软删的行不再被计算
  });
});
