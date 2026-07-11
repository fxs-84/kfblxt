import { describe, it, expect } from "vitest";
import { sortPatientsByCreatedDesc } from "./patient-sort";
import type { Patient } from "./patient.schema";

const fixture = (id: string, createdAt?: Date): Patient => ({
  id,
  orgId: "00000000-0000-4000-8000-0000000000f0",
  name: id,
  sex: "male",
  birthDate: new Date("1990-01-01"),
  phone: "",
  dominantHand: "right",
  createdAt,
});

describe("sortPatientsByCreatedDesc", () => {
  it("空列表返回空数组(不抛错)", () => {
    expect(sortPatientsByCreatedDesc([])).toEqual([]);
  });

  it("同一 createdAt 保持稳定(不交换相邻元素)", () => {
    const ts = new Date("2026-07-11T10:00:00Z");
    const a = fixture("a", ts);
    const b = fixture("b", ts);
    const c = fixture("c", ts);
    const sorted = sortPatientsByCreatedDesc([a, b, c]);
    expect(sorted.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("createdAt 不同:新→旧 desc 排序", () => {
    const t1 = new Date("2026-01-01T00:00:00Z");
    const t2 = new Date("2026-06-01T00:00:00Z");
    const t3 = new Date("2026-12-01T00:00:00Z");
    const sorted = sortPatientsByCreatedDesc([fixture("old", t1), fixture("mid", t2), fixture("new", t3)]);
    expect(sorted.map((p) => p.id)).toEqual(["new", "mid", "old"]);
  });

  it("createdAt 缺省的条目沉底(epoch=0),不影响其他元素的相对顺序", () => {
    const a = fixture("a"); // 无 createdAt
    const b = fixture("b", new Date("2026-06-01T00:00:00Z"));
    const c = fixture("c", new Date("2026-12-01T00:00:00Z"));
    const sorted = sortPatientsByCreatedDesc([a, b, c]);
    // c(2026-12) → b(2026-06) → a(epoch=0)
    expect(sorted.map((p) => p.id)).toEqual(["c", "b", "a"]);
  });

  it("不修改入参数组(不可变)", () => {
    const t1 = new Date("2026-01-01T00:00:00Z");
    const t2 = new Date("2026-06-01T00:00:00Z");
    const input = [fixture("old", t1), fixture("new", t2)];
    const beforeIds = input.map((p) => p.id);
    sortPatientsByCreatedDesc(input);
    const afterIds = input.map((p) => p.id);
    expect(afterIds).toEqual(beforeIds); // 入参未被原地排序
  });
});
