import { describe, it, expect } from "vitest";
import { scoreCsi, CSI_ITEM_COUNT, classifyCsi } from "./csi";

describe("scoreCsi", () => {
  const allZero = Array<number>(CSI_ITEM_COUNT).fill(0);
  const allFour = Array<number>(CSI_ITEM_COUNT).fill(4);

  it("全 0:总分 0,轻度", () => {
    const r = scoreCsi(allZero);
    expect(r.total).toBe(0);
    expect(r.severity).toBe("normal");
  });

  it("全 4:总分 100,极度", () => {
    const r = scoreCsi(allFour);
    expect(r.total).toBe(100);
    expect(r.severity).toBe("extreme");
  });

  it("总分 29 → 轻度", () => {
    const items = [...allZero];
    items[0] = 4; items[1] = 4; items[2] = 4; items[3] = 4;
    items[4] = 4; items[5] = 4; items[6] = 4; items[7] = 1;
    // 4*8 + 1 = 33? No wait 4*8=32, 29 = 4*7+1
    // Let me just set specific values
    const v = [...allZero]; v[0]=4; v[1]=4; v[2]=4; v[3]=4; v[4]=4; v[5]=4; v[6]=4; v[7]=1;
    expect(scoreCsi(v).total).toBe(29);
    expect(scoreCsi(v).severity).toBe("normal");
  });

  it("总分 30 → 中度", () => {
    const v = [...allZero]; v[0]=4; v[1]=4; v[2]=4; v[3]=4; v[4]=4; v[5]=4; v[6]=4; v[7]=2;
    expect(scoreCsi(v).total).toBe(30);
    expect(scoreCsi(v).severity).toBe("moderate");
  });

  it("总分 40 → 重度", () => {
    const v = [...allZero]; for (let i=0; i<10; i++) v[i]=4;
    expect(scoreCsi(v).total).toBe(40);
    expect(scoreCsi(v).severity).toBe("severe");
  });

  it("总分 50 → 极度", () => {
    const v = [...allZero]; for (let i=0; i<13; i++) v[i]=4; v[12]=2;
    expect(scoreCsi(v).total).toBe(50);
    expect(scoreCsi(v).severity).toBe("extreme");
  });

  it("项数不足抛错", () => {
    expect(() => scoreCsi([4,4,4])).toThrow(/25/);
  });

  it("超出 0-4 抛错", () => {
    const v = [...allZero]; v[5] = 5;
    expect(() => scoreCsi(v)).toThrow(/0-4/);
  });

  it("非整数抛错", () => {
    const v = [...allZero]; v[3] = 2.5;
    expect(() => scoreCsi(v)).toThrow(/整数/);
  });
});

describe("classifyCsi", () => {
  it("0-29 → normal", () => { expect(classifyCsi(0)).toBe("normal"); expect(classifyCsi(29)).toBe("normal"); });
  it("30-39 → moderate", () => { expect(classifyCsi(30)).toBe("moderate"); expect(classifyCsi(39)).toBe("moderate"); });
  it("40-49 → severe", () => { expect(classifyCsi(40)).toBe("severe"); expect(classifyCsi(49)).toBe("severe"); });
  it("50+ → extreme", () => { expect(classifyCsi(50)).toBe("extreme"); expect(classifyCsi(100)).toBe("extreme"); });
});
