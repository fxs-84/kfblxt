import { describe, it, expect } from "vitest";
import { analyze, generateNarrative } from "./reasoning-engine";
import type { ClinicalContext } from "./ai-assistant.types";

const ctxWithDiagnosis: ClinicalContext = {
  chiefComplaint: { regions: ["left-lower-back", "left-calves-内侧"], nature: ["麻木", "放射痛", "无力"], vas: 7 },
  examFindings: [
    { name: "跟腱反射", left: 0, right: 2 },
    { name: "直腿抬高试验", left: "阳性" },
  ],
  diagnosis: { levels: ["神经根"], mechanisms: ["机械压迫", "神经敏化"], side: "left", segments: ["L5", "S1"], nerves: ["坐骨神经"], cutaneousNerveIds: ["sural"] },
};

const ctxMinimal: ClinicalContext = {
  chiefComplaint: { regions: ["left-neck", "left-forearm-内侧"], nature: ["麻木", "刺痛"], vas: 6 },
  examFindings: [],
};

describe("analyze", () => {
  it("完整诊断→返回高置信定位+干预建议", () => {
    const result = analyze(ctxWithDiagnosis);
    expect(result.completeness).toBe("高置信");
    expect(result.localizationSuggestions.length).toBeGreaterThan(0);
    expect(result.interventionSuggestions.length).toBeGreaterThan(0);
  });

  it("仅有主诉→返回推测建议+建议更多信息", () => {
    const result = analyze(ctxMinimal);
    expect(result.completeness).toBe("需要更多信息");
  });

  it("始终推荐 VOR 训练+呼吸训练(基础)", () => {
    const result = analyze(ctxMinimal);
    const ids = result.interventionSuggestions.map((s) => s.interventionId);
    expect(ids).toContain("vor-training");
    expect(ids).toContain("breathing-training");
  });

  it("机制匹配→推荐对应干预", () => {
    const result = analyze(ctxWithDiagnosis);
    const names = result.interventionSuggestions.map((s) => s.name);
    expect(names.some((n) => n.includes("脱敏") || n.includes("神经"))).toBe(true);
  });
});

describe("generateNarrative", () => {
  it("生成包含 S/O/A/P 的完整笔记", () => {
    const n = generateNarrative(ctxWithDiagnosis);
    expect(n.subjective.length).toBeGreaterThan(10);
    expect(n.objective.length).toBeGreaterThan(5);
    expect(n.assessment).toContain("L5");
    expect(n.plan).toContain("建议");
  });
});
