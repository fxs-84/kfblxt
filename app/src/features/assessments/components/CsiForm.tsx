import { useState, useMemo } from "react";
import { CSI_ITEMS, CSI_SCORE_LABELS, scoreCsi, CSI_SEVERITY_LABELS } from "../scales/csi";

/**
 * CSI 中枢敏感性量表 — 客户自评表。
 * 25 题,每题 0-4 单选,自动计算总分与分级。
 */
export function CsiForm() {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [expanded, setExpanded] = useState(true);

  const total = useMemo(() => {
    const values = CSI_ITEMS.map((it) => answers[it.index] ?? 0);
    return scoreCsi(values);
  }, [answers]);

  const answered = Object.keys(answers).length;

  return (
    <div className="card" style={{ margin: "var(--space-3) 0", border: "1px solid var(--color-border)" }}>
      <div className="exam-panel__header">
        <h3 className="panel__title" style={{ fontSize: "var(--text-base)" }}>📋 CSI 中枢敏感性量表（客户自评）</h3>
        <span className="panel__hint">{answered}/25 题 · 总分 {total.total} · {CSI_SEVERITY_LABELS[total.severity]}</span>
      </div>

      {/* 评分标准 */}
      <div style={{ padding: "var(--space-2) var(--space-5)", background: "var(--color-accent-weak)", fontSize: "var(--text-sm)", borderBottom: "1px solid var(--color-border)" }}>
        <b>评分:</b>{" "}
        {CSI_SCORE_LABELS.map((l, i) => <span key={i} style={{ marginRight: 12 }}>{l}</span>)}
        <span style={{ marginLeft: 12, color: "var(--color-text-muted)" }}>
          | 分级: 0-29正常 / 30-39中度 / 40-49重度 / ≥50极度
        </span>
      </div>

      <button type="button" className="exam-cat__toggle" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
        <span className="exam-cat__chevron">{expanded ? "▾" : "▸"}</span>
        展开/收起题目
      </button>

      {expanded && (
        <div className="exam-cat__body">
          {CSI_ITEMS.map((item) => {
            const val = answers[item.index];
            return (
              <div key={item.index} className="exam-item brain-item--lg" style={{ borderBottom: "1px dotted var(--color-border)" }}>
                <div className="exam-item__label" style={{ fontSize: "var(--text-base)" }}>
                  <span style={{ minWidth: 36, fontWeight: 700, color: "var(--color-text-muted)" }}>{item.index}.</span>
                  <span>{item.text}</span>
                </div>
                <div className="brain-radio-group">
                  {[0, 1, 2, 3, 4].map((n) => (
                    <label key={n} className={`brain-chip brain-chip--lg ${val === n ? "brain-chip--on" : ""}`} title={CSI_SCORE_LABELS[n]}>
                      <input type="radio" name={`csi-${item.index}`} checked={val === n}
                        onChange={() => setAnswers((p) => ({ ...p, [item.index]: n }))} />
                      {n}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 结果摘要 */}
      <div style={{ padding: "var(--space-3) var(--space-5)", borderTop: "1px solid var(--color-border)", display: "flex", gap: "var(--space-4)" }}>
        <div><b>总分:</b> <span style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>{total.total}</span><span style={{ color: "var(--color-text-muted)" }}> / 100</span></div>
        <div><b>分级:</b> <span className={`brain-severity brain-severity--${total.severity === "extreme" ? "severe" : total.severity}`}>{CSI_SEVERITY_LABELS[total.severity]}</span></div>
      </div>
    </div>
  );
}