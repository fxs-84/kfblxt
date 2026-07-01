import { describe, it, expect } from "vitest";
import { vasSeries, aggregateRegions } from "./encounter.select";
import type { EncounterRecord } from "./encounter.repository";

function makeEncounter(date: string, vas: number, regions: EncounterRecord["chiefComplaint"]["regions"]): EncounterRecord {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date(date),
    orgId: "00000000-0000-4000-8000-0000000000f0",
    patientId: "aaaaaaaa-0000-4000-8000-000000000001",
    encounterDate: new Date(date),
    visitType: "复诊",
    status: "进行中" as const,
    chiefComplaint: { regions, nature: ["麻木"], vas, durationText: "1月" },
  };
}

describe("vasSeries", () => {
  it("按日期升序输出 VAS 点", () => {
    const series = vasSeries([
      makeEncounter("2026-03-01", 7, ["left-hamstring-内侧"]),
      makeEncounter("2026-01-01", 4, ["left-hamstring-内侧"]),
    ]);
    expect(series.map((p) => p.vas)).toEqual([4, 7]);
  });
});

describe("aggregateRegions", () => {
  it("合并区域并取各区域历次 VAS 最大值", () => {
    const agg = aggregateRegions([
      makeEncounter("2026-01-01", 4, ["left-hamstring-内侧"]),
      makeEncounter("2026-02-01", 8, ["left-hamstring-内侧", "left-calves-内侧"]),
    ]);
    expect(new Set(agg.regions)).toEqual(new Set(["left-hamstring-内侧", "left-calves-内侧"]));
    expect(agg.intensity["left-hamstring-内侧"]).toBe(8);
    expect(agg.intensity["left-calves-内侧"]).toBe(8);
  });
});
