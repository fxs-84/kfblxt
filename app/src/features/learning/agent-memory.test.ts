import { describe, it, expect } from "vitest";
import {
  recordDiagnosis,
  recordOutcome,
  recordPersonalAction,
  getAgentStats,
  getInterventionEffectiveness,
  rankDiagnosisByHistory,
  patternKey,
} from "./agent-memory";

describe("agent-memory", () => {

  it("recordDiagnosis 创建模式并可通过 stats 读取", () => {
    recordDiagnosis(["神经根", "周围神经"], ["机械压迫"], "腰骶+左小腿", ["neural-desensitization", "quick-stretch"]);
    const stats = getAgentStats();
    expect(stats.totalPatterns).toBeGreaterThanOrEqual(1);
    expect(stats.totalActions).toBeGreaterThanOrEqual(0);
  });

  it("recordOutcome 记录疗效并可查询有效率", () => {
    recordOutcome("plan-1", "test", ["vor-training"], "显效", "短期");
    recordOutcome("plan-2", "test", ["vor-training"], "无效", "短期");
    const eff = getInterventionEffectiveness("vor-training");
    expect(eff.total).toBe(2);
    expect(eff.effective).toBe(1);
    expect(eff.rate).toBeCloseTo(0.5);
  });

  it("recordPersonalAction 更新偏好+操作计数", () => {
    recordPersonalAction("create_diagnosis", "诊断", { diagnosisLevels: ["神经根", "小脑"] });
    recordPersonalAction("create_treatment", "治疗", { interventionId: "vor-training" });
    const stats = getAgentStats();
    expect(stats.totalActions).toBeGreaterThanOrEqual(2);
  });

  it("patternKey 生成一致", () => {
    const a = patternKey(["神经根"], ["机械压迫"], "腰骶");
    const b = patternKey(["神经根"], ["机械压迫"], "腰骶");
    expect(a).toBe(b);
  });

  it("rankDiagnosisByHistory 给有相关模式的历史诊断更高分", () => {
    recordDiagnosis(["神经根"], ["机械压迫"], "腰骶", ["quick-stretch"]);
    const ranked = rankDiagnosisByHistory(["神经根", "小脑", "皮质"], "腰骶+左小腿", ["机械压迫"]);
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0]).toBe("神经根"); // 最匹配
  });
});
