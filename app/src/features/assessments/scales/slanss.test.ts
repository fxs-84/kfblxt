import { describe, it, expect } from "vitest";
import { scoreSlanss, SLANSS_ITEM_COUNT, SLANSS_THRESHOLD, SLANSS_ITEMS } from "./slanss";

describe("scoreSlanss", () => {
  const allNo = SLANSS_ITEMS.map(() => 0);
  const allYes = SLANSS_ITEMS.map((i) => i.scores[1]); // [5,5,3,2,1,5,3]

  it("全否:总分 0,阴性", () => {
    const r = scoreSlanss(allNo);
    expect(r.total).toBe(0);
    expect(r.result).toBe("negative");
  });

  it("全是:总分 24,阳性", () => {
    const r = scoreSlanss(allYes);
    expect(r.total).toBe(24);
    expect(r.result).toBe("positive");
  });

  it("刚好 12 分 → 阳性(≥12)", () => {
    // 选项4(2分)+5(1分)+6(5分)+7(3分) = 11分,加选项1(5分)
    const v = [...allNo]; v[0]=5; v[3]=2; v[4]=1; v[5]=5; v[6]=3;
    expect(scoreSlanss(v).total).toBe(16);
    expect(scoreSlanss(v).result).toBe("positive");
  });

  it("11 分 → 阴性", () => {
    // 选项1(5分)+3(3分)+4(2分)+5(1分) = 11
    const v = [...allNo]; v[0]=5; v[2]=3; v[3]=2; v[4]=1;
    expect(scoreSlanss(v).total).toBe(11);
    expect(scoreSlanss(v).result).toBe("negative");
  });

  it("项数不足抛错", () => {
    expect(() => scoreSlanss([5, 5])).toThrow(/7/);
  });

  it("非法分值抛错", () => {
    expect(() => scoreSlanss([3, 0, 0, 0, 0, 0, 0])).toThrow(/0 或 5/);
  });
});

describe("SLANSS_THRESHOLD", () => {
  it("阈值为 12", () => { expect(SLANSS_THRESHOLD).toBe(12); });
});
