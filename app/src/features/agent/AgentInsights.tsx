import { useMemo } from "react";
import { getAgentStats, getInterventionEffectiveness } from "./agent-memory";
import { INTERVENTIONS_CATALOG } from "../treatment/interventions-catalog";

export function AgentInsights() {
  const stats = useMemo(() => getAgentStats(), []);
  const topInterventionsWithNames = stats.topInterventions
    .map((t) => {
      const def = INTERVENTIONS_CATALOG.find((i) => i.id === t.interventionId);
      const eff = getInterventionEffectiveness(t.interventionId);
      return { ...t, name: def?.name ?? t.interventionId, effectiveness: eff };
    })
    .slice(0, 6);

  const effectiveRate = Number(stats.effectiveRate);
  const hasData = stats.totalActions > 0;

  return (
    <div className="card panel" style={{ marginBottom: "var(--space-4)" }}>
      <div className="panel__head">
        <div>
          <h3 className="panel__title">🧠 Agent 学习报告</h3>
          <span className="panel__hint">
            {hasData
              ? `已从 ${stats.totalActions} 次操作中学习`
              : "开始使用系统,Agent 将自动学习你的临床模式"}
          </span>
        </div>
      </div>

      {!hasData ? (
        <div className="empty" style={{ padding: "var(--space-6)" }}>
          完成几次完整的就诊(查体→诊断→治疗→复评)后,Agent 会在这里展示学习到的模式。
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", padding: "0 var(--space-4) var(--space-4)" }}>
          {/* 统计条 */}
          <div className="stat-row" style={{ border: "none", padding: 0, margin: 0 }}>
            <div className="stat">
              <span className="stat__value">{stats.totalActions}</span>
              <span className="stat__label">总操作</span>
            </div>
            <div className="stat">
              <span className="stat__value">{stats.totalPatterns}</span>
              <span className="stat__label">学习模式</span>
            </div>
            <div className="stat">
              <span className="stat__value">{stats.totalOutcomes}</span>
              <span className="stat__label">疗效记录</span>
            </div>
            <div className="stat">
              <span className="stat__value">
                <span style={{ color: effectiveRate >= 70 ? "var(--color-normal)" : effectiveRate >= 40 ? "var(--color-caution)" : "var(--color-abnormal)" }}>
                  {stats.effectiveRate}%
                </span>
              </span>
              <span className="stat__label">有效/显效率</span>
            </div>
          </div>

          {/* 最常用干预 */}
          {topInterventionsWithNames.length > 0 && (
            <div>
              <div className="ai-section__title">⭐ 你最常用的干预</div>
              <div className="ai-suggestion-list">
                {topInterventionsWithNames.map((t, i) => (
                  <div key={i} className="ai-suggestion">
                    <div className="ai-suggestion__head">
                      <span className="badge badge--normal" style={{ fontSize: "10px" }}>{t.count}次</span>
                      <strong style={{ fontSize: "var(--text-sm)" }}>{t.name}</strong>
                      {t.effectiveness.total > 0 && (
                        <span className="badge" style={{
                          fontSize: "10px",
                          marginLeft: "auto",
                          background: t.effectiveness.rate >= 0.7 ? "var(--color-normal-weak)" : "var(--color-caution-weak)",
                          color: t.effectiveness.rate >= 0.7 ? "var(--color-normal)" : "var(--color-caution)",
                        }}>
                          有效 {Math.round(t.effectiveness.rate * 100)}%
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 最近模式 */}
          {stats.recentPatterns.length > 0 && (
            <div>
              <div className="ai-section__title">🔗 最近识别的临床模式</div>
              <div className="ai-suggestion-list">
                {stats.recentPatterns.map((p, i) => (
                  <div key={i} className="ai-suggestion">
                    <div className="ai-suggestion__head">
                      <span className="badge badge--caution" style={{ fontSize: "10px" }}>{p.occurrences}次</span>
                      <strong style={{ fontSize: "var(--text-xs)" }}>{p.label}</strong>
                    </div>
                    <p className="ai-suggestion__text">
                      常用处理: {p.topInterventions.slice(0, 3).map((t) => INTERVENTIONS_CATALOG.find((i) => i.id === t.interventionId)?.name ?? t.interventionId).join(" → ")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
