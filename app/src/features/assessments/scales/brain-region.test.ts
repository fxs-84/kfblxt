import { describe, it, expect } from "vitest";
import {
  scoreBrainRegion,
  findRegionForItem,
  regionMaxScore,
  BRAIN_REGION_DEFS,
  BRAIN_REGION_MAX_TOTAL,
  BRAIN_REGION_ITEMS,
  type BrainRegionResponses,
} from "./brain-region";

/** 工具:生成 1-100 题答卷(跳过 46) */
function fullResponses(value: number, phoneEar: BrainRegionResponses["phoneEar"] = "no_preference"): BrainRegionResponses {
  const items: Record<number, number> = {};
  for (let i = 1; i <= 100; i++) {
    if (i === 46) continue; // 第 46 题不进 0-4 答卷
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
  it("题号 65 虽未列出但属于枕叶区间(64-66 含 65 缺省)", () => {
    // 原 PDF 在 64 与 66 之间缺 65,定位仍按区间归属枕叶
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

describe("scoreBrainRegion", () => {
  it("全 0:总分 0,无高负担分区", () => {
    const r = scoreBrainRegion(fullResponses(0));
    expect(r.total).toBe(0);
    expect(r.percent).toBe(0);
    expect(r.highBurdenRegions).toEqual([]);
  });

  it("全 4:总分等于 BRAIN_REGION_MAX_TOTAL - 第46题贡献(0)", () => {
    // 全 4 但第 46 题不进总分,所以总分仍是 400
    const r = scoreBrainRegion(fullResponses(4));
    expect(r.total).toBe(BRAIN_REGION_MAX_TOTAL);
    expect(r.percent).toBe(100);
    // 16 个分区全部达到 50%
    expect(r.highBurdenRegions.length).toBe(BRAIN_REGION_DEFS.length);
  });

  it("前额叶全 4,其他全 0:前额叶进入高负担,其他不进入", () => {
    const items: Record<number, number> = {};
    for (let i = 1; i <= 100; i++) {
      if (i === 46) continue;
      items[i] = i >= 1 && i <= 17 ? 4 : 0;
    }
    const r = scoreBrainRegion({ items, phoneEar: null });
    expect(r.byRegion.prefrontal).toBe(17 * 4);
    expect(r.highBurdenRegions).toEqual(["prefrontal"]);
  });

  it("听觉皮层:第 39-45 + 46(不进分) 部分计分", () => {
    const items: Record<number, number> = {};
    for (let i = 39; i <= 45; i++) items[i] = 4;
    // 第 46 题刻意放进 items 也不应计入总分
    items[46] = 2;
    const r = scoreBrainRegion({ items, phoneEar: "right" });
    // 听觉皮层满分 28,7 × 4 = 28 → 100%
    expect(r.byRegion.auditoryCortex).toBe(28);
    expect(r.highBurdenRegions).toContain("auditoryCortex");
    // 总分不应包含第 46 题贡献
    expect(r.total).toBe(28);
  });

  it("第 46 题偏好侧字段不影响总分", () => {
    const r1 = scoreBrainRegion(fullResponses(0, "right"));
    const r2 = scoreBrainRegion(fullResponses(0, "left"));
    const r3 = scoreBrainRegion(fullResponses(0, "no_preference"));
    expect(r1.total).toBe(r2.total);
    expect(r2.total).toBe(r3.total);
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
  });
});

describe("BRAIN_REGION_ITEMS 完整性", () => {
  it("100 道题都有题号 1-100", () => {
    const indexes = BRAIN_REGION_ITEMS.map((i) => i.index).sort((a, b) => a - b);
    // 原 PDF 在枕叶段 64 后直接到 66,缺 65;故全集实际是 99 道
    expect(indexes[0]).toBe(1);
    expect(indexes.at(-1)).toBe(100);
    // 不重复
    expect(new Set(indexes).size).toBe(indexes.length);
    expect(indexes.length).toBeGreaterThanOrEqual(99);
    expect(indexes.length).toBeLessThanOrEqual(100);
  });
});