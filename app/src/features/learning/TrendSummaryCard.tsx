/**
 * P3-12: 客户概览趋势解读 — Agent 自动总结 VAS 变化趋势。
 */
import { useMemo } from "react";
import { generateTrendSummary } from "./agent-utils";
import { getVasHistory } from "./agent-memory";
import { useAllEncounters } from "../encounters/useEncounters";

interface TrendSummaryCardProps { patientId: string }

export function TrendSummaryCard({ patientId }: TrendSummaryCardProps) {
  const { data: encounters = [] } = useAllEncounters();
  const vasHistory = useMemo(() => getVasHistory(patientId), [patientId]);
  const trend = useMemo(() => generateTrendSummary(vasHistory, encounters.filter((e) => e.patientId === patientId).length), [vasHistory, encounters, patientId]);

  if (vasHistory.length < 2) return null;

  return (
    <div className="card" style={{ marginBottom: "var(--space-6)", padding: "var(--space-4) var(--space-6)", borderLeft: `4px solid ${trend.trend === "improving" ? "var(--color-normal)" : trend.trend === "worsening" ? "var(--color-abnormal)" : "var(--color-caution)"}` }}>
      <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
        <span style={{ fontSize: "1.1rem" }}>
          {trend.trend === "improving" ? "📈" : trend.trend === "worsening" ? "⚠️" : "📊"}
        </span>
        <span style={{ fontWeight: 600, fontSize: "var(--text-sm)", color: trend.trend === "improving" ? "var(--color-normal)" : trend.trend === "worsening" ? "var(--color-abnormal)" : "var(--color-caution)" }}>
          {trend.trend === "improving" ? "趋势向好" : trend.trend === "worsening" ? "需关注" : "趋势平稳"}
        </span>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginLeft: "auto" }}>
          🧠 Agent 分析
        </span>
      </div>
      <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-sm)", color: "var(--color-text-muted)", lineHeight: 1.5 }}>
        {trend.summary}
      </p>
    </div>
  );
}
