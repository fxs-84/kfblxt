import { useState, useMemo } from "react";
import { SLANSS_ITEMS, scoreSlanss, SLANSS_THRESHOLD } from "../scales/slanss";

/**
 * S-LANSS 利兹神经病理性疼痛自评量表 — 客户自评。
 * 7 题,每题二选一(否/是),自动计算总分与诊断阈值判定。
 */
export function SlanssForm() {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [expanded, setExpanded] = useState(true);

  const total = useMemo(() => {
    const values = SLANSS_ITEMS.map((it) => answers[it.index] ?? 0);
    return scoreSlanss(values);
  }, [answers]);

  const answered = Object.keys(answers).length;

  return (
    <div className="card" style={{ margin: "var(--space-3) 0", border: "1px solid var(--color-border)" }}>
      <div className="exam-panel__header">
        <h3 className="panel__title" style={{ fontSize: "var(--text-base)" }}>📋 S-LANSS 神经病理性疼痛自评（客户自评）</h3>
        <span className="panel__hint">{answered}/7 题 · 总分 {total.total}{total.total >= SLANSS_THRESHOLD ? " · ⚠ ≥12 提示神经病理性疼痛" : ""}</span>
      </div>

      {/* 评分标准 */}
      <div style={{ padding: "var(--space-2) var(--space-5)", background: "var(--color-accent-weak)", fontSize: "var(--text-sm)", borderBottom: "1px solid var(--color-border)" }}>
        <b>说明:</b> 请根据过去一周的真实感受回答以下 7 个问题,选择"是"或"否"。
        <span style={{ marginLeft: 12, color: "var(--color-text-muted)" }}>
          | 诊断阈值: ≥{SLANSS_THRESHOLD} 分 = 提示神经病理性疼痛
        </span>
      </div>

      <button type="button" className="exam-cat__toggle" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
        <span className="exam-cat__chevron">{expanded ? "▾" : "▸"}</span>
        展开/收起题目
      </button>

      {expanded && (
        <div className="exam-cat__body">
          {SLANSS_ITEMS.map((item) => {
            const val = answers[item.index];
            return (
              <div key={item.index} style={{ padding: "var(--space-2) 0", borderBottom: "1px dotted var(--color-border)" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                  <b style={{ minWidth: 24, color: "var(--color-text-muted)" }}>{item.index}.</b>
                  <span style={{ flex: 1, fontSize: "var(--text-sm)" }}>{item.question}</span>
                </div>
                <div className="brain-radio-group" style={{ paddingLeft: 32 }}>
                  {item.options.map((opt, oi) => {
                    const pts = item.scores[oi];
                    const on = val === pts;
                    return (
                      <label key={oi} className={`brain-chip brain-chip--lg ${on && oi === 1 ? "brain-chip--on" : ""}`}
                        style={{
                          cursor: "pointer",
                          opacity: on && oi === 0 ? 0.7 : 1,
                          background: on && oi === 0 ? "var(--color-surface-sunken)" : undefined,
                          border: on && oi === 0 ? "1px solid var(--color-border)" : undefined,
                        }}>
                        <input type="radio" name={`slanss-${item.index}`} checked={on}
                          onChange={() => setAnswers((p) => ({ ...p, [item.index]: pts }))} />
                        {opt}({pts}分)
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 结果摘要 */}
      <div style={{ padding: "var(--space-3) var(--space-5)", borderTop: "1px solid var(--color-border)", display: "flex", gap: "var(--space-4)", alignItems: "center" }}>
        <div><b>总分:</b> <span style={{ fontSize: "var(--text-xl)", fontWeight: 700, color: total.total >= SLANSS_THRESHOLD ? "var(--color-abnormal)" : "var(--color-normal)" }}>{total.total}</span><span style={{ color: "var(--color-text-muted)" }}> / 24</span></div>
        <div>
          {total.total >= SLANSS_THRESHOLD
            ? <span className="brain-severity brain-severity--severe">⚠ ≥{SLANSS_THRESHOLD}分:提示神经病理性疼痛</span>
            : <span className="brain-severity brain-severity--normal">&lt;{SLANSS_THRESHOLD}分:未见神经病理性疼痛证据</span>}
        </div>
      </div>
    </div>
  );
}