import { describe, it, expect } from "vitest";
import { calcAge, vasSeverity, birthDateFromAge } from "./format";

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

describe("birthDateFromAge", () => {
  const now = new Date("2026-10-09");

  it("29 岁 → 出生日期取 29 年前的今天,立即算回 29", () => {
    const bd = birthDateFromAge(29, now);
    expect(calcAge(bd, now)).toBe(29);
  });

  it("明年同一天自动 +1 岁(无需维护)", () => {
    const bd = birthDateFromAge(29, now);
    const nextYear = new Date("2027-10-09");
    expect(calcAge(bd, nextYear)).toBe(30);
  });

  it("0 岁新生儿 → 出生日期 = 今天", () => {
    const bd = birthDateFromAge(0, now);
    expect(calcAge(bd, now)).toBe(0);
  });

  it("拒绝非法年龄", () => {
    expect(() => birthDateFromAge(-1, now)).toThrow();
    expect(() => birthDateFromAge(151, now)).toThrow();
    expect(() => birthDateFromAge(29.5, now)).toThrow();
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
