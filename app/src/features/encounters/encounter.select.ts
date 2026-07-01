import type { BodyRegion } from "../../components/bodymap/regions";
import type { EncounterRecord } from "./encounter.repository";

export interface VasPoint {
  date: string;
  vas: number;
}

/** 按时间升序返回 VAS 序列,供趋势图使用 */
export function vasSeries(encounters: readonly EncounterRecord[]): VasPoint[] {
  return [...encounters]
    .sort((a, b) => a.encounterDate.getTime() - b.encounterDate.getTime())
    .map((e) => ({
      date: e.encounterDate.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }),
      vas: e.chiefComplaint.vas,
    }));
}

export interface RegionAggregate {
  regions: BodyRegion[];
  intensity: Partial<Record<BodyRegion, number>>;
}

/** 汇总所有就诊标记过的症状区域,强度取该区域历次 VAS 的最大值 */
export function aggregateRegions(encounters: readonly EncounterRecord[]): RegionAggregate {
  const intensity: Partial<Record<BodyRegion, number>> = {};
  for (const e of encounters) {
    for (const region of e.chiefComplaint.regions) {
      const current = intensity[region] ?? 0;
      intensity[region] = Math.max(current, e.chiefComplaint.vas);
    }
  }
  return { regions: Object.keys(intensity) as BodyRegion[], intensity };
}
