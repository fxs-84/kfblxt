import { describe, it, expect } from "vitest";
import {
  normalizeInterventionDoses,
  INTENSITY_LEVELS,
  isIntensityLevel,
  type InterventionDose,
} from "./intervention-dose";

describe("INTENSITY_LEVELS", () => {
  it("暴露三个强度档:轻度/中度/重度", () => {
    expect(INTENSITY_LEVELS).toEqual(["轻度", "中度", "重度"]);
  });
});

describe("isIntensityLevel", () => {
  it.each([
    ["轻度", true],
    ["中度", true],
    ["重度", true],
    ["极重度", false],
    ["", false],
    ["LOW", false],
  ])("'%s' -> %s", (v, ok) => {
    expect(isIntensityLevel(v)).toBe(ok);
  });
});

describe("normalizeInterventionDoses", () => {
  it("空输入返回空 record", () => {
    expect(normalizeInterventionDoses({})).toEqual({});
  });

  it("丢弃三个剂量字段都为空的项", () => {
    const out = normalizeInterventionDoses({
      "vor-1": { durationMin: undefined, sets: undefined, intensity: undefined } as InterventionDose,
    });
    expect(out).toEqual({});
  });

  it("只填了组数,其他字段可空", () => {
    const out = normalizeInterventionDoses({ "vor-1": { sets: 3 } });
    expect(out).toEqual({ "vor-1": { durationMin: undefined, sets: 3, intensity: undefined } });
  });

  it("填了 durationMin 与 intensity,组数可空", () => {
    const out = normalizeInterventionDoses({ "vor-1": { durationMin: 10, intensity: "中度" } });
    expect(out["vor-1"]?.durationMin).toBe(10);
    expect(out["vor-1"]?.intensity).toBe("中度");
    expect(out["vor-1"]?.sets).toBeUndefined();
  });

  it("durationMin 负数抛错", () => {
    expect(() => normalizeInterventionDoses({ a: { durationMin: -1 } })).toThrow(/durationMin/);
  });

  it("durationMin 非整数抛错", () => {
    expect(() => normalizeInterventionDoses({ a: { durationMin: 2.5 } })).toThrow(/durationMin/);
  });

  it("sets 非正整数抛错", () => {
    expect(() => normalizeInterventionDoses({ a: { sets: 0 } })).toThrow(/sets/);
    expect(() => normalizeInterventionDoses({ a: { sets: -1 } })).toThrow(/sets/);
    expect(() => normalizeInterventionDoses({ a: { sets: 2.5 } })).toThrow(/sets/);
    expect(() => normalizeInterventionDoses({ a: { sets: 1.5 } })).toThrow(/sets/);
  });

  it("sets 正整数通过", () => {
    expect(normalizeInterventionDoses({ a: { sets: 1 } })["a"]?.sets).toBe(1);
    expect(normalizeInterventionDoses({ a: { sets: 5 } })["a"]?.sets).toBe(5);
  });

  it("未知强度档抛错", () => {
    expect(() => normalizeInterventionDoses({ a: { intensity: "极重" as never } })).toThrow(/intensity/);
  });

  it("多个干预独立处理", () => {
    const out = normalizeInterventionDoses({
      a: { durationMin: 5, sets: 2, intensity: "轻度" },
      b: { durationMin: 20, sets: 5, intensity: "重度" },
    });
    expect(Object.keys(out).sort()).toEqual(["a", "b"]);
    expect(out.a?.intensity).toBe("轻度");
    expect(out.b?.intensity).toBe("重度");
  });

  it("不可变:返回新对象,不入参被修改", () => {
    const input: Record<string, InterventionDose> = { a: { sets: 3 } };
    const snap = JSON.stringify(input);
    normalizeInterventionDoses(input);
    expect(JSON.stringify(input)).toBe(snap);
  });

  it("空 id 抛错", () => {
    expect(() => normalizeInterventionDoses({ "": { sets: 1 } })).toThrow(/id/);
  });
});
