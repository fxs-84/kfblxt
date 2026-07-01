import { describe, it, expect } from "vitest";
import { diagnosisRepository, findDiagnosisByEncounter } from "./diagnosis.repository";
import type { DiagnosisInput } from "./diagnosis.repository";

const VALID_INPUT: DiagnosisInput = {
  encounterId: "enc-001",
  orgId: "00000000-0000-4000-8000-0000000000f0",
  levels: ["神经根"],
  mechanisms: ["机械压迫"],
  side: "left",
  reasoning: "L5/S1左突出→S1神经根受压",
  segments: ["S1"],
  nerves: ["坐骨神经"],
  cutaneousNerveIds: ["sural"],
};

describe("diagnosisRepository", () => {
  it("create 保存完整定位诊断并可由 encounterId 查到", async () => {
    const created = await diagnosisRepository.create(VALID_INPUT);
    expect(created.id).toBeTruthy();
    expect(created.levels).toEqual(["神经根"]);
    expect(created.mechanisms).toEqual(["机械压迫"]);
    expect(created.cutaneousNerveIds).toEqual(["sural"]);

    const found = await findDiagnosisByEncounter("enc-001");
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
  });

  it("只选 levels+mechanisms(无可选字段)也能保存", async () => {
    const created = await diagnosisRepository.create({
      encounterId: "enc-002",
      orgId: "00000000-0000-4000-8000-0000000000f0",
      levels: ["皮质", "小脑"],
      mechanisms: ["发育未整合"],
      side: "bilateral",
      reasoning: "",
    });
    expect(created.reasoning).toBe("");
    expect(created.segments).toBeUndefined();
  });

  it("保存空 cutaneousNerveIds 也不抛错", async () => {
    const created = await diagnosisRepository.create({
      ...VALID_INPUT,
      encounterId: "enc-003",
      cutaneousNerveIds: [],
    });
    expect(created.cutaneousNerveIds).toEqual([]);
  });
});
