import { describe, it, expect } from "vitest";
import {
  scoreBrainRegion,
  findRegionForItem,
  regionMaxScore,
  classifyRegionSeverity,
  BRAIN_REGION_DEFS,
  BRAIN_REGION_MAX_TOTAL,
  BRAIN_REGION_ITEMS,
  AFFECTED_THRESHOLD,
  type BrainRegionResponses,
} from "./brain-region";

/** 工具:生成 1-100 题答卷(跳过 46) */
function fullResponses(value: number, phoneEar: BrainRegionResponses["phoneEar"] = "no_preference"): BrainRegionResponses {
  const items: Record<number, number> = {};
  for (let i = 1; i <= 100; i++) {
    if (i === 46) continue;
    items[i] = value;
  }
  return { items, phoneEar };
}

describe("findRegionForItem", () => {
  it("题号 1 落在前额叶", () => {
    expect(findRegionForItem(1)?.id).toBe("prefrontal");
  });
  it("题号 17 仍是前额叶尾题", () => {
    expect(findRegionForItem(17)?.id).toBe("prefrontal");
  });
  it("题号 18 进入中央前区", () => {
    expect(findRegionForItem(18)?.id).toBe("premotor");
  });
  it("题号 46 属于听觉皮层(虽然不进总分)", () => {
    expect(findRegionForItem(46)?.id).toBe("auditoryCortex");
  });
  it("题号 100 收尾于交感神经", () => {
    expect(findRegionForItem(100)?.id).toBe("sympathetic");
  });
  it("题号 65 虽未列出但属于枕叶区间", () => {
    expect(findRegionForItem(65)?.id).toBe("occipital");
  });
  it("题号 0 / 101 返回 null", () => {
    expect(findRegionForItem(0)).toBeNull();
    expect(findRegionForItem(101)).toBeNull();
  });
});

describe("regionMaxScore", () => {
  it("前额叶 17 题 × 4 = 68", () => {
    const def = BRAIN_REGION_DEFS.find((d) => d.id === "prefrontal")!;
    expect(regionMaxScore(def)).toBe(68);
  });
  it("听觉皮层 8 题 - 第46题 = 7 × 4 = 28", () => {
    const def = BRAIN_REGION_DEFS.find((d) => d.id === "auditoryCortex")!;
    expect(regionMaxScore(def)).toBe(28);
  });
});

describe("classifyRegionSeverity", () => {
  it("0 分 → normal", () => {
    expect(classifyRegionSeverity(0, 68)).toBe("normal");
  });
  it("小计 16 / 68 (ratio < 0.25) → normal", () => {
    expect(classifyRegionSeverity(16, 68)).toBe("normal");
  });
  it("小计 17 / 68 (恰好 0.25) → mild(达阈值)", () => {
    expect(classifyRegionSeverity(17, 68)).toBe("mild");
  });
  it("小计 33 / 68 (≈ 0.485) → mild", () => {
    expect(classifyRegionSeverity(33, 68)).toBe("mild");
  });
  it("小计 34 / 68 (恰好 0.5) → moderate", () => {
    expect(classifyRegionSeverity(34, 68)).toBe("moderate");
  });
  it("小计 50 / 68 (≈ 0.735) → moderate", () => {
    expect(classifyRegionSeverity(50, 68)).toBe("moderate");
  });
  it("小计 51 / 68 (恰好 0.75) → severe", () => {
    expect(classifyRegionSeverity(51, 68)).toBe("severe");
  });
  it("小计 68 / 68 → severe", () => {
    expect(classifyRegionSeverity(68, 68)).toBe("severe");
  });
  it("满分 0 → normal(防御)", () => {
    expect(classifyRegionSeverity(5, 0)).toBe("normal");
  });
});

describe("scoreBrainRegion — 1/4 阈值核心规则", () => {
  it("全 0:无问题分区", () => {
    const r = scoreBrainRegion(fullResponses(0));
    expect(r.affectedRegions).toEqual([]);
    for (const def of BRAIN_REGION_DEFS) {
      expect(r.severityByRegion[def.id]).toBe("normal");
    }
  });

  it("用户规则示例:前额叶 17 题全打 1,小计 = 17(25%),达阈值 → mild", () => {
    // 前额叶 17 题,每题 1 分 = 17 分,17/68 = 25%
    const items: Record<number, number> = {};
    for (let i = 1; i <= 100; i++) {
      if (i === 46) continue;
      items[i] = i >= 1 && i <= 17 ? 1 : 0;
    }
    const r = scoreBrainRegion({ items, phoneEar: null });
    expect(r.byRegion.prefrontal).toBe(17);
    expect(r.severityByRegion.prefrontal).toBe("mild");
    expect(r.affectedRegions).toContain("prefrontal");
  });

  it("前额叶 16 题 × 1 = 16(< 25%),不到阈值 → normal", () => {
    const items: Record<number, number> = {};
    // 让前额叶只有 16 题打 1,第 17 题打 0
    for (let i = 1; i <= 16; i++) items[i] = 1;
    items[17] = 0;
    for (let i = 18; i <= 100; i++) {
      if (i !== 46) items[i] = 0;
    }
    const r = scoreBrainRegion({ items, phoneEar: null });
    expect(r.byRegion.prefrontal).toBe(16);
    expect(r.severityByRegion.prefrontal).toBe("normal");
    expect(r.affectedRegions).not.toContain("prefrontal");
  });

  it("用户规则示例:前额叶 17 题全 1 → 有问题;其他全 0 → 没问题", () => {
    const items: Record<number, number> = {};
    for (let i = 1; i <= 100; i++) {
      if (i === 46) continue;
      items[i] = i >= 1 && i <= 17 ? 1 : 0;
    }
    const r = scoreBrainRegion({ items, phoneEar: null });
    // 只有前额叶
    expect(r.affectedRegions).toEqual(["prefrontal"]);
  });

  it("全 1:每个分区小计都 ≥ 25%,全部判定为轻度(每个分区满分不同)", () => {
    const r = scoreBrainRegion(fullResponses(1));
    // 全 1:每个分区小计 = 题数,ratio = 题数/(题数*4) = 0.25 恰好达阈值
    expect(r.affectedRegions.length).toBe(BRAIN_REGION_DEFS.length);
    for (const def of BRAIN_REGION_DEFS) {
      expect(r.severityByRegion[def.id]).toBe("mild");
    }
  });

  it("全 4:全部进入重度", () => {
    const r = scoreBrainRegion(fullResponses(4));
    expect(r.total).toBe(BRAIN_REGION_MAX_TOTAL);
    expect(r.percent).toBe(100);
    for (const def of BRAIN_REGION_DEFS) {
      expect(r.severityByRegion[def.id]).toBe("severe");
    }
  });

  it("全 2:每个分区小计 = 2 × 题数,ratio = 50% → 全部中度", () => {
    const r = scoreBrainRegion(fullResponses(2));
    expect(r.affectedRegions.length).toBe(BRAIN_REGION_DEFS.length);
    for (const def of BRAIN_REGION_DEFS) {
      expect(r.severityByRegion[def.id]).toBe("moderate");
    }
  });

  it("全 3:每个分区 ratio = 75% → 全部重度", () => {
    const r = scoreBrainRegion(fullResponses(3));
    for (const def of BRAIN_REGION_DEFS) {
      expect(r.severityByRegion[def.id]).toBe("severe");
    }
  });

  it("听觉皮层:第 39-45 全 4(7 × 4 = 28 = 100%) + 第 46 题独立 → severe", () => {
    const items: Record<number, number> = {};
    for (let i = 39; i <= 45; i++) items[i] = 4;
    items[46] = 2; // 第 46 题单独存储,不影响评分
    const r = scoreBrainRegion({ items, phoneEar: "right" });
    expect(r.byRegion.auditoryCortex).toBe(28);
    expect(r.severityByRegion.auditoryCortex).toBe("severe");
  });

  it("听觉皮层:39-45 全 1(7 分 = 25% 满分 28)→ 恰好 mild,达阈值", () => {
    const items: Record<number, number> = {};
    for (let i = 39; i <= 45; i++) items[i] = 1;
    const r = scoreBrainRegion({ items, phoneEar: null });
    expect(r.byRegion.auditoryCortex).toBe(7);
    expect(r.severityByRegion.auditoryCortex).toBe("mild");
    expect(r.affectedRegions).toContain("auditoryCortex");
  });

  it("第 46 题偏好侧字段不影响总分与分区判定", () => {
    const r1 = scoreBrainRegion(fullResponses(0, "right"));
    const r2 = scoreBrainRegion(fullResponses(0, "left"));
    const r3 = scoreBrainRegion(fullResponses(0, "no_preference"));
    expect(r1.total).toBe(r2.total);
    expect(r2.total).toBe(r3.total);
    expect(r1.affectedRegions).toEqual(r2.affectedRegions);
  });

  it("混合:前额叶 mild + 中央前区 severe + 布罗卡 normal", () => {
    const items: Record<number, number> = {};
    // 前额叶 17 题全 1 → 17/68 = 25% → mild
    for (let i = 1; i <= 17; i++) items[i] = 1;
    // 中央前区 18-23 全 4 → 6 题 × 4 = 24 / 24 = 100% → severe
    for (let i = 18; i <= 23; i++) items[i] = 4;
    // 布罗卡 24-26 全 0 → 0 → normal
    for (let i = 24; i <= 26; i++) items[i] = 0;
    // 其余全 0
    for (let i = 27; i <= 100; i++) {
      if (i !== 46) items[i] = 0;
    }
    const r = scoreBrainRegion({ items, phoneEar: null });
    expect(r.severityByRegion.prefrontal).toBe("mild");
    expect(r.severityByRegion.premotor).toBe("severe");
    expect(r.severityByRegion.broca).toBe("normal");
    expect(r.affectedRegions).toContain("prefrontal");
    expect(r.affectedRegions).toContain("premotor");
    expect(r.affectedRegions).not.toContain("broca");
  });

  it("单项超出 0-4 抛出错误", () => {
    const items = fullResponses(0).items;
    items[1] = 5;
    expect(() => scoreBrainRegion({ items, phoneEar: null })).toThrow(/0-4/);
  });

  it("单项非整数抛出错误", () => {
    const items = fullResponses(0).items;
    items[2] = 2.5;
    expect(() => scoreBrainRegion({ items, phoneEar: null })).toThrow(/整数/);
  });

  it("未作答的题视为 0,不抛错", () => {
    const items: Record<number, number> = { 1: 0 };
    const r = scoreBrainRegion({ items, phoneEar: null });
    expect(r.total).toBe(0);
    expect(r.byRegion.prefrontal).toBe(0);
    expect(r.affectedRegions).toEqual([]);
  });
});

describe("阈值常量", () => {
  it("AFFECTED_THRESHOLD 等于 1/4", () => {
    expect(AFFECTED_THRESHOLD).toBe(0.25);
  });
});

describe("BRAIN_REGION_ITEMS 完整性", () => {
  it("100 道题都有题号 1-100(缺 65)", () => {
    const indexes = BRAIN_REGION_ITEMS.map((i) => i.index).sort((a, b) => a - b);
    expect(indexes[0]).toBe(1);
    expect(indexes.at(-1)).toBe(100);
    expect(new Set(indexes).size).toBe(indexes.length);
    expect(indexes.length).toBeGreaterThanOrEqual(99);
    expect(indexes.length).toBeLessThanOrEqual(100);
  });
});