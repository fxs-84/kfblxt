import { describe, it, expect } from "vitest";
import { calcAge, vasSeverity } from "./format";

describe("calcAge", () => {
  const now = new Date("2026-07-01");

  it("生日已过按整岁计算", () => {
    expect(calcAge(new Date("1990-01-01"), now)).toBe(36);
  });

  it("生日未到当年减一岁", () => {
    expect(calcAge(new Date("1990-12-31"), now)).toBe(35);
  });

  it("生日当天计入整岁", () => {
    expect(calcAge(new Date("1990-07-01"), now)).toBe(36);
  });
});

describe("vasSeverity", () => {
  it("0-3 为轻度(normal)", () => {
    expect(vasSeverity(0)).toBe("normal");
    expect(vasSeverity(3)).toBe("normal");
  });

  it("4-6 为中度(caution)", () => {
    expect(vasSeverity(4)).toBe("caution");
    expect(vasSeverity(6)).toBe("caution");
  });

  it("7-10 为重度(abnormal)", () => {
    expect(vasSeverity(7)).toBe("abnormal");
    expect(vasSeverity(10)).toBe("abnormal");
  });
});
