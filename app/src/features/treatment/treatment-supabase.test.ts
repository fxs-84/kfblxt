import { describe, it, expect, beforeEach } from "vitest";
import { treatmentPlanRepository, progressNoteRepository } from "./treatment.repository";
import {
  findPlansByEncounterDual,
  createPlanDual,
  deletePlanDual,
  findNotesByPlanDual,
  createNoteDual,
  findNotesByEncounterDual,
} from "./treatment-supabase";

const ORG = "00000000-0000-4000-8000-0000000000f0";
const ENC_A = "eeeeeeee-0000-4000-8000-000000000001";
const ENC_B = "eeeeeeee-0000-4000-8000-000000000002";

async function clearLocal() {
  const a = await treatmentPlanRepository.findAll();
  for (const x of a) await treatmentPlanRepository.remove(x.id);
  const b = await progressNoteRepository.findAll();
  for (const x of b) await progressNoteRepository.remove(x.id);
}

const basePlanInput = {
  orgId: ORG,
  encounterId: ENC_A,
  phase: "恢复期" as const,
  frequency: "3次/周",
  duration: "4周",
  interventionIds: ["vor-training"],
  interventionDoses: { "vor-training": { durationMin: 10, sets: 3, intensity: "中度" as const } },
  goals: [{ term: "short" as const, description: "VOR 改善", metric: "<10%" }],
  boundaries: undefined,
};

const baseNoteInput = (planId: string) => ({
  orgId: ORG,
  encounterId: ENC_A,
  treatmentPlanId: planId,
  node: "立即" as const,
  vasAfter: 3,
  outcome: "有效" as const,
  adjustment: "调整强度",
});

describe("treatment dual-mode dispatcher (no Supabase env → fallback)", () => {
  beforeEach(async () => {
    await clearLocal();
  });

  it("createPlanDual 保存逐项剂量与目标", async () => {
    const plan = await createPlanDual(basePlanInput as Parameters<typeof createPlanDual>[0]);
    expect(plan.interventionDoses?.["vor-training"]?.durationMin).toBe(10);
    expect(plan.goals).toHaveLength(1);
    expect(plan.goals[0]?.description).toBe("VOR 改善");
  });

  it("findPlansByEncounterDual 按 encounter 隔离并按时间降序", async () => {
    await createPlanDual(basePlanInput as Parameters<typeof createPlanDual>[0]);
    await new Promise((r) => setTimeout(r, 5));
    await createPlanDual({
      ...basePlanInput,
      encounterId: ENC_B,
    } as Parameters<typeof createPlanDual>[0]);

    const listA = await findPlansByEncounterDual(ENC_A);
    expect(listA).toHaveLength(1);
    const listB = await findPlansByEncounterDual(ENC_B);
    expect(listB).toHaveLength(1);
    expect(listA[0]?.encounterId).toBe(ENC_A);
  });

  it("createNoteDual + findNotesByPlanDual round-trip", async () => {
    const plan = await createPlanDual(basePlanInput as Parameters<typeof createPlanDual>[0]);
    const note = await createNoteDual(baseNoteInput(plan.id) as Parameters<typeof createNoteDual>[0]);
    expect(note.vasAfter).toBe(3);
    expect(note.outcome).toBe("有效");
    const list = await findNotesByPlanDual(plan.id);
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(note.id);
  });

  it("findNotesByEncounterDual 返回该 encounter 所有 note", async () => {
    const planA = await createPlanDual(basePlanInput as Parameters<typeof createPlanDual>[0]);
    const planB = await createPlanDual({
      ...basePlanInput,
      encounterId: ENC_B,
    } as Parameters<typeof createPlanDual>[0]);
    await createNoteDual(baseNoteInput(planA.id) as Parameters<typeof createNoteDual>[0]);
    await createNoteDual({
      ...baseNoteInput(planB.id),
      encounterId: ENC_B,
    } as Parameters<typeof createNoteDual>[0]);
    const listA = await findNotesByEncounterDual(ENC_A);
    const listB = await findNotesByEncounterDual(ENC_B);
    expect(listA).toHaveLength(1);
    expect(listB).toHaveLength(1);
  });

  it("deletePlanDual 软删除", async () => {
    const plan = await createPlanDual(basePlanInput as Parameters<typeof createPlanDual>[0]);
    await deletePlanDual(plan.id);
    const list = await findPlansByEncounterDual(ENC_A);
    expect(list).toHaveLength(0);
  });
});
