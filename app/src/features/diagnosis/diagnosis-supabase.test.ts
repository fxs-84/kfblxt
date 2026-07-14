import { describe, it, expect, beforeEach } from "vitest";
import { diagnosisRepository } from "./diagnosis.repository";
import {
  findDiagnosisByEncounterDual,
  createDiagnosisDual,
  updateDiagnosisDual,
  deleteDiagnosisDual,
} from "./diagnosis-supabase";

const ORG = "00000000-0000-4000-8000-0000000000f0";
const ENC = "eeeeeeee-0000-4000-8000-0000000000a1";

async function clearLocal() {
  const all = await diagnosisRepository.findAll();
  for (const d of all) await diagnosisRepository.remove(d.id);
}

const baseInput = {
  orgId: ORG,
  encounterId: ENC,
  levels: ["皮质", "前庭"] as Array<"皮质" | "前庭">,
  mechanisms: ["神经调控"],
  side: "left" as const,
  reasoning: "急性发作期",
  segments: ["C5", "C6"],
  nerves: ["肌皮神经"],
  cutaneousNerveIds: ["前臂内侧皮神经"],
  clinicalDiagnoses: [
    { code: "M54.5", name: "腰痛", isPrimary: true },
    { code: "I10", name: "高血压", isPrimary: false },
  ],
};

describe("diagnosis dual-mode dispatcher (no Supabase env → fallback)", () => {
  beforeEach(async () => {
    await clearLocal();
  });

  it("createDiagnosisDual 保存完整字段并可查回", async () => {
    const d = await createDiagnosisDual(baseInput as Parameters<typeof createDiagnosisDual>[0]);
    expect(d.levels).toEqual(["皮质", "前庭"]);
    expect(d.cutaneousNerveIds).toEqual(["前臂内侧皮神经"]);
    expect(d.clinicalDiagnoses).toHaveLength(2);
    expect(d.clinicalDiagnoses?.[0]?.code).toBe("M54.5");
  });

  it("findDiagnosisByEncounterDual 返回最新一条", async () => {
    const a = await createDiagnosisDual(baseInput as Parameters<typeof createDiagnosisDual>[0]);
    await new Promise((r) => setTimeout(r, 5));
    const b = await createDiagnosisDual({
      ...baseInput,
      reasoning: "复诊调整",
    } as Parameters<typeof createDiagnosisDual>[0]);
    const latest = await findDiagnosisByEncounterDual(ENC);
    expect(latest?.reasoning).toBe("复诊调整");
    expect(latest?.id).toBe(b.id);
    expect(latest?.id).not.toBe(a.id);
  });

  it("updateDiagnosisDual 部分字段更新", async () => {
    const d = await createDiagnosisDual(baseInput as Parameters<typeof createDiagnosisDual>[0]);
    const updated = await updateDiagnosisDual(d.id, { reasoning: "改后理由" });
    expect(updated.reasoning).toBe("改后理由");
    expect(updated.levels).toEqual(["皮质", "前庭"]);
  });

  it("deleteDiagnosisDual 软删除", async () => {
    const d = await createDiagnosisDual(baseInput as Parameters<typeof createDiagnosisDual>[0]);
    await deleteDiagnosisDual(d.id);
    expect(await findDiagnosisByEncounterDual(ENC)).toBeNull();
  });
});
