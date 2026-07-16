import { describe, it, expect } from "vitest";
import { treatmentPlanRepository, findPlansByEncounter } from "./treatment.repository";
import type { TreatmentPlanInput } from "./treatment.repository";

const BASE: TreatmentPlanInput = {
  encounterId: "enc-dose",
  orgId: "00000000-0000-4000-8000-0000000000f0",
  patientId: "patient-001",
  phase: "恢复期",
  frequency: "3次/周",
  duration: "4周",
  interventionIds: ["vor-training", "neural-desensitization"],
  goals: [{ term: "short", description: "VOR 增益改善", metric: "<10%" }],
  boundary: undefined,
};

describe("TreatmentPlan interventionDoses", () => {
  it("create + find 保留逐项剂量", async () => {
    const input: TreatmentPlanInput = {
      ...BASE,
      interventionDoses: {
        "vor-training": { durationMin: 10, sets: 3, intensity: "中度" },
        "neural-desensitization": { durationMin: 5, sets: 1, intensity: "轻度" },
      },
    };
    const created = await treatmentPlanRepository.create(input);
    const found = await findPlansByEncounter("enc-dose");
    expect(found).toHaveLength(1);
    expect(found[0].interventionDoses).toEqual(input.interventionDoses);
    expect(created.id).toBeTruthy();
  });

  it("不填 interventionDoses 时存为 undefined(向后兼容旧 plan)", async () => {
    const created = await treatmentPlanRepository.create(BASE);
    const found = await findPlansByEncounter("enc-dose");
    expect(found[0].id).toBe(created.id);
    expect(found[0].interventionDoses).toBeUndefined();
  });

  it("部分填:有干预有剂量,部分无剂量单独运行不报错", async () => {
    const created = await treatmentPlanRepository.create({
      ...BASE,
      encounterId: "enc-dose-partial",
      interventionDoses: {
        "vor-training": { sets: 2 },
      },
    });
    const found = await findPlansByEncounter("enc-dose-partial");
    const doses = found[0].interventionDoses;
    expect(doses).toBeDefined();
    expect(doses?.["vor-training"]?.sets).toBe(2);
    expect(doses?.["neural-desensitization"]).toBeUndefined();
  });

  it("note(整条训练备注)随 plan 持久化", async () => {
    const input: TreatmentPlanInput = {
      ...BASE,
      encounterId: "enc-dose-note",
      interventionDoses: {
        "vor-training": {
          durationMin: 8,
          sets: 3,
          intensity: "中度",
          note: "颈椎术后避免过伸;备 VOR 替代动作",
        },
      },
    };
    const created = await treatmentPlanRepository.create(input);
    const found = await findPlansByEncounter("enc-dose-note");
    expect(found[0].id).toBe(created.id);
    expect(found[0].interventionDoses?.["vor-training"]?.note).toBe(
      "颈椎术后避免过伸;备 VOR 替代动作",
    );
  });

  it("仅 note 即可让条目保留(无需剂量字段)", async () => {
    const input: TreatmentPlanInput = {
      ...BASE,
      encounterId: "enc-note-only",
      interventionDoses: {
        "vor-training": { note: "仅记录注意事项,无具体剂量" },
      },
    };
    const created = await treatmentPlanRepository.create(input);
    const found = await findPlansByEncounter("enc-note-only");
    expect(found[0].interventionDoses?.["vor-training"]?.note).toBe(
      "仅记录注意事项,无具体剂量",
    );
    expect(found[0].interventionDoses?.["vor-training"]?.durationMin).toBeUndefined();
    expect(found[0].interventionDoses?.["vor-training"]?.sets).toBeUndefined();
  });
});
