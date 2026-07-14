import { describe, it, expect } from "vitest";
import { toSharePlan } from "./build-snapshot";
import type { TreatmentPlanRecord } from "../treatment/treatment.repository";

const ORG = "00000000-0000-4000-8000-0000000000f0";

function planFixture(overrides: Partial<TreatmentPlanRecord> = {}): TreatmentPlanRecord {
  return {
    id: "plan-1",
    encounterId: "enc-1",
    orgId: ORG,
    createdAt: new Date("2026-07-14"),
    phase: "恢复期",
    frequency: "3次/周",
    duration: "4周",
    interventionIds: ["vor-training", "neural-desensitization"],
    goals: [{ term: "short", description: "VOR 增益改善" }],
    boundaries: undefined,
    createdBy: "u-1",
    updatedAt: new Date(),
    updatedBy: "u-1",
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  } as TreatmentPlanRecord;
}

describe("toSharePlan", () => {
  it("基础字段完整传递", () => {
    const out = toSharePlan(planFixture());
    expect(out.id).toBe("plan-1");
    expect(out.phase).toBe("恢复期");
    expect(out.frequency).toBe("3次/周");
    expect(out.duration).toBe("4周");
    expect(out.interventionIds).toEqual(["vor-training", "neural-desensitization"]);
    expect(out.goals).toEqual(["VOR 增益改善"]);
  });

  it("干预剂量随快照传递(单条)", () => {
    const out = toSharePlan(
      planFixture({
        interventionDoses: {
          "vor-training": { durationMin: 10, sets: 3, intensity: "中度" },
        },
      }),
    );
    expect(out.interventionDoses?.["vor-training"]).toEqual({
      durationMin: 10,
      sets: 3,
      intensity: "中度",
    });
  });

  it("干预剂量随快照传递(多条 + 备注)", () => {
    const out = toSharePlan(
      planFixture({
        interventionDoses: {
          "vor-training": {
            durationMin: 8,
            sets: 3,
            intensity: "中度",
            note: "颈椎术后避免过伸",
          },
          "neural-desensitization": { sets: 1, intensity: "轻度" },
        },
      }),
    );
    expect(out.interventionDoses?.["vor-training"]?.note).toBe("颈椎术后避免过伸");
    expect(out.interventionDoses?.["neural-desensitization"]?.intensity).toBe("轻度");
  });

  it("无 interventionDoses 时字段为 undefined(向后兼容旧 plan)", () => {
    const out = toSharePlan(planFixture({ interventionDoses: undefined }));
    expect(out.interventionDoses).toBeUndefined();
  });

  it("goals 内非对象形态(字符串)直接保留", () => {
    const out = toSharePlan(
      planFixture({
        // @ts-expect-error - 测试历史 plan 用字符串 goals 的退化路径
        goals: ["步行更稳", "减少放射痛"],
      }),
    );
    expect(out.goals).toEqual(["步行更稳", "减少放射痛"]);
  });
});
