import { useState, useMemo } from "react";
import { SLANSS_ITEMS, scoreSlanss, SLANSS_THRESHOLD } from "../scales/slanss";

interface SlanssFormProps {
  onResult: (result: { items: Record<number, number>; total: number; positive: boolean }) => void;
}

/**
 * S-LANSS 利兹神经病理性疼痛自评量表 — 患者自评。
 * 7 题,每题二选一(否/是),自动计算总分与诊断阈值判定。
 */
export function SlanssForm({ onResult }: SlanssFormProps) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [expanded, setExpanded] = useState(true);

  const total = useMemo(() => {
    const values = SLANSS_ITEMS.map((it) => answers[it.index] ?? 0);
    const r = scoreSlanss(values);
    onResult({ items: answers, total: r.total, positive: r.result === "positive" });
    return r;
  }, [answers, onResult]);

  const answered = Object.keys(answers).length;

  return (
    <div className="card" style={{ margin: "var(--space-3) 0", border: "1px solid var(--color-border)" }}>
      <div className="exam-panel__header">
        <h3 className="panel__title" style={{ fontSize: "var(--text-base)" }}>📋 S-LANSS 神经病理性疼痛自评量表（患者自评）</h3>
        <span className="panel__hint">{answered}/7 题 · 总分 {total.total}{total.total >= SLANSS_THRESHOLD ? " · ⚠ ≥12 提示神经病理性疼痛" : ""}</span>
      </div>

      {/* 评分标准 */}
      <div style={{ padding: "var(--space-2) var(--space-5)", background: "var(--color-accent-weak)", fontSize: "var(--text-sm)", borderBottom: "1px solid var(--color-border)" }}>
        <b>说明:</b> 请根据过去一周的真实感受回答以下 7 个问题，选择"是"或"否"。
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
              <div key={item.index} className="exam-item brain-item--lg" style={{ borderBottom: "1px dotted var(--color-border)", flexDirection: "column", alignItems: "stretch" }}>
                <div className="exam-item__label" style={{ fontSize: "var(--text-base)", marginBottom: "var(--space-2)" }}>
                  <span style={{ minWidth: 36, fontWeight: 700, color: "var(--color-text-muted)" }}>{item.index}.</span>
                  <span>{item.question}</span>
                </div>
                <div className="brain-radio-group" style={{ justifyContent: "flex-end" }}>
                  {item.options.map((opt, oi) => {
                    const pts = item.scores[oi];
                    const isOn = val === pts;
                    return (
                      <label key={oi} className={`brain-chip brain-chip--lg ${isOn ? (oi === 1 ? "brain-chip--on" : "brain-chip--off") : ""}`}
                        style={isOn && oi === 0 ? { background: "#e9eef3", borderColor: "var(--color-border)", color: "var(--color-text)" } : undefined}>
                        <input type="radio" name={`slanss-${item.index}`} checked={isOn}
                          onChange={() => setAnswers((p) => ({ ...p, [item.index]: pts }))} />
                        {opt} ({pts}分)
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
          {total.total >= SLANSS_THRESHOLD ? (
            <span className="brain-severity brain-severity--severe">⚠ ≥{SLANSS_THRESHOLD}分：提示神经病理性疼痛</span>
          ) : (
            <span className="brain-severity brain-severity--normal">&lt;{SLANSS_THRESHOLD}分：未见神经病理性疼痛证据</span>
          )}
        </div>
      </div>
    </div>
  );
}
