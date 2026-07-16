import { describe, it, expect } from "vitest";
import { treatmentPlanRepository, findPlansByEncounter } from "./treatment.repository";
import type { TreatmentPlanInput } from "./treatment.repository";

const VALID: TreatmentPlanInput = {
  encounterId: "enc-001",
  orgId: "00000000-0000-4000-8000-0000000000f0",
  patientId: "patient-001",
  phase: "急性期",
  frequency: "3次/周",
  duration: "4周",
  interventionIds: ["neural-desensitization", "vor-training"],
  goals: [
    { term: "short", description: "VAS 疼痛评分降低", metric: "7→3 分" },
    { term: "long", description: "独立上下楼", metric: "扶手→无扶" },
  ],
  boundary: "3月无改善转诊手术",
};

describe("treatmentPlanRepository", () => {
  it("create 保存完整治疗计划并可查回", async () => {
    const created = await treatmentPlanRepository.create(VALID);
    expect(created.id).toBeTruthy();
    expect(created.goals).toHaveLength(2);
    expect(created.interventionIds).toContain("neural-desensitization");

    const found = await findPlansByEncounter("enc-001");
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(created.id);
  });

  it("每个 encounter 可有多条计划", async () => {
    await treatmentPlanRepository.create({ ...VALID, encounterId: "enc-002" });
    await treatmentPlanRepository.create({ ...VALID, encounterId: "enc-002", phase: "恢复期" });
    const plans = await findPlansByEncounter("enc-002");
    expect(plans).toHaveLength(2);
  });
});
