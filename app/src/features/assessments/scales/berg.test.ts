import { describe, it, expect } from "vitest";
import { scoreBerg, BERG_ITEM_COUNT } from "./berg";

/**
 * Berg 平衡量表:14 项,每项 0-4 分,总分 0-56。
 * 分级(跌倒风险):0-20 高 / 21-40 中 / 41-56 低。
 * 注:分级阈值待临床医师签字确认(见任务 #6)。
 */
describe("scoreBerg", () => {
  const fullNormal = Array<number>(BERG_ITEM_COUNT).fill(4); // 全 4 分 = 56

  it("满分 56 判定为低跌倒风险", () => {
    const result = scoreBerg(fullNormal);
    expect(result.total).toBe(56);
    expect(result.risk).toBe("low");
  });

  it("总分 30 判定为中跌倒风险", () => {
    const items = Array<number>(BERG_ITEM_COUNT).fill(0);
    items[0] = 4;
    items[1] = 4;
    items[2] = 4;
    items[3] = 4;
    items[4] = 4;
    items[5] = 4;
    items[6] = 4;
    items[7] = 2; // 合计 30
    const result = scoreBerg(items);
    expect(result.total).toBe(30);
    expect(result.risk).toBe("moderate");
  });

  it("总分 15 判定为高跌倒风险", () => {
    const items = Array<number>(BERG_ITEM_COUNT).fill(0);
    items[0] = 4;
    items[1] = 4;
    items[2] = 4;
    items[3] = 3; // 合计 15
    const result = scoreBerg(items);
    expect(result.total).toBe(15);
    expect(result.risk).toBe("high");
  });

  it("项数不足 14 抛出错误", () => {
    expect(() => scoreBerg([4, 4, 4])).toThrow(/14/);
  });

  it("单项超出 0-4 范围抛出错误", () => {
    const items = Array<number>(BERG_ITEM_COUNT).fill(4);
    items[5] = 5;
    expect(() => scoreBerg(items)).toThrow(/0-4/);
  });

  it("非整数分值抛出错误", () => {
    const items = Array<number>(BERG_ITEM_COUNT).fill(4);
    items[2] = 2.5;
    expect(() => scoreBerg(items)).toThrow(/整数/);
  });
});
