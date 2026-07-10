import { useState } from "react";
import { CSI_ITEMS, CSI_SCORE_LABELS, scoreCsi, CSI_SEVERITY_LABELS } from "../scales/csi";
import { SLANSS_ITEMS, SLANSS_THRESHOLD, scoreSlanss } from "../scales/slanss";

interface PainAssessmentPanelProps {
  patientId: string;
  encounterId: string;
}

/**
 * 疼痛评估量表(患者自评)— 组合面板:
 *  CSI 25 项 + S-LANSS 7 项
 *
 *  说明:暂以组件本地状态展示,不持久化。
 *  后续若要保存,可拆分独立 pain-assessments 仓储。
 */
export function PainAssessmentPanel({ patientId: _patientId, encounterId: _encounterId }: PainAssessmentPanelProps) {
  const [open, setOpen] = useState(true);
  const [csi, setCsi] = useState<Record<number, number>>({});
  const [slanss, setSlanss] = useState<Record<number, number>>({});
  const [done, setDone] = useState(false);

  const csiTotal = (() => {
    const arr = CSI_ITEMS.map((it) => csi[it.index] ?? 0);
    try { return scoreCsi(arr).total; } catch { return 0; }
  })();
  const csiSeverity = (() => {
    const arr = CSI_ITEMS.map((it) => csi[it.index] ?? 0);
    try { return scoreCsi(arr).severity; } catch { return "normal"; }
  })();
  const slanssTotal = (() => {
    const arr = SLANSS_ITEMS.map((it) => slanss[it.index] ?? 0);
    try { return scoreSlanss(arr).total; } catch { return 0; }
  })();
  const slanssPositive = slanssTotal >= SLANSS_THRESHOLD;

  const csiAnswered = Object.keys(csi).length;
  const slanssAnswered = Object.keys(slanss).length;

  const handleSubmit = () => {
    if (csiAnswered !== CSI_ITEMS.length || slanssAnswered !== SLANSS_ITEMS.length) {
      alert(`请完成全部题目 (CSI ${csiAnswered}/${CSI_ITEMS.length}, S-LANSS ${slanssAnswered}/${SLANSS_ITEMS.length})`);
      return;
    }
    setDone(true);
  };

  if (done) {
    return (
      <div className="card panel" style={{ marginBottom: "var(--space-4)", border: "1px solid var(--color-normal)", background: "var(--color-normal-weak)" }}>
        <h3 className="panel__title" style={{ color: "var(--color-normal)" }}>✅ 疼痛评估量表已提交</h3>
        <div style={{ display: "flex", gap: "var(--space-4)", marginTop: "var(--space-2)", fontSize: "var(--text-sm)" }}>
          <div>CSI 总分:<b>{csiTotal}</b> · <span className={`brain-severity brain-severity--${csiSeverity === "extreme" ? "severe" : csiSeverity}`}>{CSI_SEVERITY_LABELS[csiSeverity]}</span></div>
          <div>S-LANSS 总分:<b>{slanssTotal}</b> · {slanssPositive ? <span className="brain-severity brain-severity--severe">⚠ 阳性</span> : <span className="brain-severity brain-severity--normal">阴性</span>}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="card panel" style={{ marginBottom: "var(--space-4)", border: "1px solid var(--color-border)" }}>
      <div className="panel__head">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3 className="panel__title">📋 疼痛评估量表（患者自评）</h3>
          <span className="panel__hint">CSI {csiAnswered}/25 · S-LANSS {slanssAnswered}/7</span>
        </div>
        <button type="button" className="btn btn--ghost" onClick={() => setOpen(!open)}>
          {open ? "⏶ 收起" : "⏷ 展开"}
        </button>
      </div>

      {open && (
        <div style={{ padding: "var(--space-3) var(--space-5)" }}>
          {/* ====== CSI 25 项 ====== */}
          <div style={{ marginBottom: "var(--space-4)" }}>
            <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginBottom: 6 }}>🧠 CSI 中枢敏感性量表 · 25 题 · 每题 0-4 分 · 总分 0-100</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8, fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
              {CSI_SCORE_LABELS.map((l, i) => <span key={i} style={{ padding: "1px 8px", background: "var(--color-surface-sunken)", borderRadius: 999 }}>{l}</span>)}
              <span style={{ marginLeft: "auto", padding: "2px 8px", background: "var(--color-accent-weak)", borderRadius: 999 }}>
                当前 {csiAnswered} / 25 题 · 总分 {csiTotal} · {CSI_SEVERITY_LABELS[csiSeverity]}
              </span>
            </div>
            {CSI_ITEMS.map((item) => {
              const v = csi[item.index];
              return (
                <div key={item.index} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px dotted var(--color-border)" }}>
                  <span style={{ minWidth: 28, color: "var(--color-text-muted)", fontWeight: 600 }}>{item.index}.</span>
                  <span style={{ flex: 1, fontSize: "var(--text-sm)" }}>{item.text}</span>
                  <div className="brain-radio-group">
                    {[0, 1, 2, 3, 4].map((n) => (
                      <label key={n} className={`brain-chip ${v === n ? "brain-chip--on" : ""}`} title={CSI_SCORE_LABELS[n]}>
                        <input type="radio" name={`csi-${item.index}`} checked={v === n}
                          onChange={() => setCsi((p) => ({ ...p, [item.index]: n }))} />
                        {n}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ====== S-LANSS 7 项 ====== */}
          <div>
            <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, marginBottom: 6 }}>📋 S-LANSS 神经病理性疼痛自评 · 7 题 · 总分 0-24 · 阈值 ≥{SLANSS_THRESHOLD} = 阳性</div>
            <div style={{ marginBottom: 8, fontSize: "var(--text-xs)", color: "var(--color-text-muted)", padding: "4px 8px", background: "var(--color-accent-weak)", borderRadius: 999, display: "inline-block" }}>
              当前 {slanssAnswered} / 7 题 · 总分 {slanssTotal} · {slanssPositive ? `⚠ ≥${SLANSS_THRESHOLD} 提示神经病理性疼痛` : "未见证据"}
            </div>
            {SLANSS_ITEMS.map((item) => {
              const v = slanss[item.index];
              return (
                <div key={item.index} style={{ padding: "8px 0", borderBottom: "1px dotted var(--color-border)" }}>
                  <div style={{ fontSize: "var(--text-sm)", marginBottom: 4 }}>
                    <b>{item.index}.</b> {item.question}
                  </div>
                  <div className="brain-radio-group">
                    {item.options.map((opt, oi) => {
                      const pts = item.scores[oi];
                      const on = v === pts;
                      return (
                        <label key={oi}
                          className={`brain-chip ${on && oi === 1 ? "brain-chip--on" : ""}`}
                          style={{
                            cursor: "pointer",
                            opacity: on && oi === 0 ? 0.7 : 1,
                            background: on && oi === 0 ? "var(--color-surface-sunken)" : undefined,
                          }}>
                          <input type="radio" name={`slanss-${item.index}`} checked={on}
                            onChange={() => setSlanss((p) => ({ ...p, [item.index]: pts }))} />
                          {opt}({pts}分)
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn--primary" onClick={handleSubmit}
              style={{ fontSize: "var(--text-base)", padding: "var(--space-2) var(--space-5)" }}>
              💾 提交疼痛评估
            </button>
          </div>
        </div>
      )}
    </div>
  );
}