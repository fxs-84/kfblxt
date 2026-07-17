import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useDraftAutosave } from "../../exam/useDraftAutosave";
import { useCreateAssessment } from "../useAssessments";
import { CSI_ITEMS, CSI_SCORE_DESCRIPTORS, scoreCsi, CSI_SEVERITY_LABELS } from "../scales/csi";
import { SLANSS_ITEMS, scoreSlanss, SLANSS_THRESHOLD } from "../scales/slanss";

interface PainAssessmentFormProps {
  /** patientId + encounterId 都传才会真正持久化到 assessments 表 */
  patientId?: string;
  encounterId?: string;
  /** 用于草稿 key,传了才有自动恢复 */
  draftKey?: string;
  onResult?: (result: { csiTotal: number; csiSeverity: string; slanssTotal: number; slanssPositive: boolean }) => void;
}

/**
 * 疼痛评估量表(客户自评)— 仿大脑区域定位表模式:
 *  顶部 sticky 进度条 · 答题自动滚到下一题 · 严重度色码 · 实时计分
 *  CSI 25 题(0-4) + S-LANSS 7 题(二选一,各题分值不同)
 *  支持草稿自动保存(draftKey 传 encounterId)
 */
export function PainAssessmentForm({ patientId, encounterId, draftKey, onResult }: PainAssessmentFormProps = {}) {
  const draftId = draftKey ? `pain:${draftKey}` : undefined;
  const draft = useDraftAutosave<{ csi: Record<number, number>; slanss: Record<number, number>; done: boolean }>(
    draftId ?? "",
    { csi: {}, slanss: {}, done: false },
  );
  const createAssessment = useCreateAssessment();
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [csi, setCsiState] = useState<Record<number, number>>(draft.value.csi);
  const [slanss, setSlanssState] = useState<Record<number, number>>(draft.value.slanss);
  const [done, setDoneState] = useState(draft.value.done);
  const [lastAnswered, setLastAnswered] = useState<{ type: "csi" | "slanss"; index: number } | null>(null);

  // 同步状态到 draft — 防抖 600ms 自动写 localStorage
  useEffect(() => {
    if (!draftId) return;
    draft.setValue({ csi, slanss, done });
  }, [csi, slanss, done, draftId]);

  const setCsi = (fn: (prev: Record<number, number>) => Record<number, number>) => {
    setCsiState((p) => fn(p));
  };
  const setSlanss = (fn: (prev: Record<number, number>) => Record<number, number>) => {
    setSlanssState((p) => fn(p));
  };

  // 题号 → DOM 元素
  const csiRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const slanssRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const setCsiRef = useCallback((i: number) => (el: HTMLDivElement | null) => {
    if (el) csiRefs.current.set(i, el);
    else csiRefs.current.delete(i);
  }, []);
  const setSlanssRef = useCallback((i: number) => (el: HTMLDivElement | null) => {
    if (el) slanssRefs.current.set(i, el);
    else slanssRefs.current.delete(i);
  }, []);

  // 进度
  const csiTotal = CSI_ITEMS.length;
  const slanssTotal = SLANSS_ITEMS.length;
  const csiAnswered = Object.keys(csi).length;
  const slanssAnswered = Object.keys(slanss).length;
  const grandTotal = csiTotal + slanssTotal;
  const grandAnswered = csiAnswered + slanssAnswered;
  const progressPct = Math.round((grandAnswered / grandTotal) * 100);

  // 计分
  const csiScore = useMemo(() => {
    try { return scoreCsi(CSI_ITEMS.map((it) => csi[it.index] ?? 0)); }
    catch { return { total: 0, severity: "normal" as const }; }
  }, [csi]);
  const slanssScore = useMemo(() => {
    try { return scoreSlanss(SLANSS_ITEMS.map((it) => slanss[it.index] ?? 0)); }
    catch { return { total: 0, result: "negative" as const }; }
  }, [slanss]);

  const prevCountRef = useRef(0);

  // 上报结果
  useEffect(() => {
    onResult?.({
      csiTotal: csiScore.total,
      csiSeverity: csiScore.severity,
      slanssTotal: slanssScore.total,
      slanssPositive: slanssScore.result === "positive",
    });
  }, [csiScore.total, csiScore.severity, slanssScore.total, slanssScore.result, onResult]);

  // 自动滚动:总量增加时,找到下一未答题滚到视口中央
  useEffect(() => {
    const prev = prevCountRef.current;
    prevCountRef.current = grandAnswered;
    if (grandAnswered <= prev) return;
    requestAnimationFrame(() => {
      const nextCsi = CSI_ITEMS.find((it) => csi[it.index] === undefined);
      if (nextCsi) {
        const el = csiRefs.current.get(nextCsi.index);
        if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("brain-item--pulse"); setTimeout(() => el.classList.remove("brain-item--pulse"), 1200); return; }
      }
      const nextSlanss = SLANSS_ITEMS.find((it) => slanss[it.index] === undefined);
      if (nextSlanss) {
        const el = slanssRefs.current.get(nextSlanss.index);
        if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("brain-item--pulse"); setTimeout(() => el.classList.remove("brain-item--pulse"), 1200); }
      }
    });
  }, [grandAnswered, csi, slanss]);

  const setCsiItem = (i: number, v: number) => {
    setCsi((p) => ({ ...p, [i]: v }));
    setLastAnswered({ type: "csi", index: i });
  };
  const setSlanssItem = (i: number, v: number) => {
    setSlanss((p) => ({ ...p, [i]: v }));
    setLastAnswered({ type: "slanss", index: i });
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    if (grandAnswered !== grandTotal) {
      setSubmitError("请完成全部题目再提交");
      return;
    }
    setSaving(true);
    try {
      await createAssessment.mutateAsync({
        patientId,
        encounterId,
        type: "pain_assessment",
        csi: {
          items: csi,
          total: csiScore.total,
          severity: csiScore.severity,
        },
        slanss: {
          items: slanss,
          total: slanssScore.total,
          positive: slanssScore.result === "positive",
        },
      } as any);
      // 只有 persist 成功才切完成态
      setDoneState(true);
      if (draftId) draft.clearDraft();
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "提交失败,请重试");
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="brain-form">
        <div className="brain-form-progress brain-form-progress--complete">
          <span>✅ 已完成</span>
          <span style={{ marginLeft: "auto", fontSize: "var(--text-base)" }}>
            CSI <b>{csiScore.total}</b> · {CSI_SEVERITY_LABELS[csiScore.severity]} ·
            S-LANSS <b>{slanssScore.total}</b> · {slanssScore.result === "positive" ? "⚠ 阳性" : "阴性"}
          </span>
        </div>
        {submitError && (
          <div className="field__error" style={{ padding: "var(--space-2) var(--space-3)", margin: "var(--space-2) var(--space-6)", background: "#fef2f2", borderRadius: "var(--radius-sm)", fontSize: 13, color: "#c33" }}>
            ❌ {submitError}
          </div>
        )}
        <div className="form-actions" style={{ justifyContent: "center" }}>
          <button className="btn btn--ghost" onClick={() => { setDoneState(false); }}>返回</button>
        </div>
      </div>
    );
  }

  return (
    <div className="brain-form">
      {/* 顶部 sticky 进度条 */}
      <div className="brain-form-progress">
        <span>📝 已作答</span>
        <div className="brain-form-progress__track">
          <div className={`brain-form-progress__fill ${grandAnswered === grandTotal ? "brain-form-progress__fill--complete" : ""}`} style={{ width: `${progressPct}%` }} />
        </div>
        <span style={{ minWidth: 120, textAlign: "right" }}>
          <b style={{ color: grandAnswered === grandTotal ? "var(--color-normal)" : "var(--color-accent)", fontSize: "var(--text-lg)" }}>{grandAnswered}</b>
          <span style={{ color: "var(--color-text-muted)" }}> / {grandTotal}</span>
          <span style={{ marginLeft: 6, color: "var(--color-text-muted)" }}>({progressPct}%)</span>
        </span>
        {draftId && draft.hasDraft && (
          <span style={{ marginLeft: 8, fontSize: 11, color: "var(--color-caution, #d48c2c)" }}>
            💾 草稿 {draft.lastSavedAt ? new Date(draft.lastSavedAt).toLocaleTimeString() : ""}
          </span>
        )}
      </div>

      {/* CSI 部分 */}
      <div className="exam-cat__body" style={{ padding: "var(--space-2) var(--space-6) var(--space-3)" }}>
        <div className="brain-form__hint">
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: "var(--text-lg)" }}>🧠 CSI 中枢敏感性量表 · 25 题 · 0-4 分</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
            {CSI_SCORE_DESCRIPTORS.map((d) => (
              <span key={d.value} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "var(--color-surface)", borderRadius: 8, border: "1px solid var(--color-border)", fontSize: "var(--text-sm)" }}>
                <b style={{ color: "var(--color-accent)", fontSize: "var(--text-lg)" }}>{d.value}</b>
                <span>= {d.label}</span>
                <span style={{ color: "var(--color-text-muted)" }}>({d.percent})</span>
              </span>
            ))}
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 12, alignItems: "center", fontSize: "var(--text-sm)" }}>
            <span>当前 <b>{csiAnswered}</b>/25 · 小计 <b style={{ color: csiScore.severity === "normal" ? "var(--color-normal)" : "#c45a00" }}>{csiScore.total}</b>/100</span>
            <span className={`brain-severity brain-severity--${csiScore.severity === "extreme" ? "severe" : csiScore.severity}`}>{CSI_SEVERITY_LABELS[csiScore.severity]}</span>
          </div>
        </div>
      </div>

      {CSI_ITEMS.map((item) => {
        const v = csi[item.index];
        const isJust = lastAnswered?.type === "csi" && lastAnswered.index === item.index;
        return (
          <div key={`csi-${item.index}`} ref={setCsiRef(item.index)}
            className={`brain-item brain-item--lg ${v !== undefined ? "brain-item--answered" : ""} ${isJust ? "brain-item--just-answered" : ""}`}
            style={{ paddingLeft: "var(--space-6)", paddingRight: "var(--space-6)" }}>
            <div className="brain-item__label" style={{ fontSize: "var(--text-base)" }}>
              <span style={{ minWidth: 40, fontWeight: 700, color: v !== undefined ? "var(--color-normal)" : "var(--color-text-muted)" }}>{item.index}.</span>
              <span>{item.text}</span>
              {v !== undefined && <span style={{ marginLeft: 6, color: "var(--color-normal)", fontSize: "var(--text-sm)", fontWeight: 600 }}>✓ {CSI_SCORE_DESCRIPTORS[v].label}</span>}
            </div>
            <div className="brain-radio-group">
              {CSI_SCORE_DESCRIPTORS.map((d) => (
                <label key={d.value} className={`brain-chip brain-chip--lg ${v === d.value ? "brain-chip--on" : ""}`} title={d.full}>
                  <input type="radio" name={`csi-${item.index}`} checked={v === d.value} onChange={() => setCsiItem(item.index, d.value)} />{d.value}</label>
              ))}
            </div>
          </div>
        );
      })}

      {/* S-LANSS 部分 */}
      <div className="exam-cat__body" style={{ padding: "var(--space-4) var(--space-6) var(--space-3)", borderTop: "2px solid var(--color-border)", marginTop: "var(--space-3)" }}>
        <div className="brain-form__hint">
          <h3 style={{ margin: 0, fontSize: "var(--text-lg)" }}>📋 S-LANSS · 7 题 · 总分 0-24</h3>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", marginTop: 4 }}>请根据过去一周的真实感受回答。</div>
          <div style={{ marginTop: 6, display: "flex", gap: 12, alignItems: "center", fontSize: "var(--text-sm)" }}>
            <span>当前 <b>{slanssAnswered}</b>/7 · 总分 <b style={{ color: slanssScore.total >= SLANSS_THRESHOLD ? "var(--color-abnormal)" : "var(--color-normal)" }}>{slanssScore.total}</b>/24</span>
            <span className={`brain-severity ${slanssScore.total >= SLANSS_THRESHOLD ? "brain-severity--severe" : "brain-severity--normal"}`}>
              {slanssScore.total >= SLANSS_THRESHOLD ? `⚠ ≥${SLANSS_THRESHOLD} 阳性` : `阴性(<${SLANSS_THRESHOLD})`}
            </span>
          </div>
        </div>
      </div>

      {SLANSS_ITEMS.map((item) => {
        const v = slanss[item.index];
        const isJust = lastAnswered?.type === "slanss" && lastAnswered.index === item.index;
        return (
          <div key={`slanss-${item.index}`} ref={setSlanssRef(item.index)}
            className={`brain-item brain-item--lg ${v !== undefined ? "brain-item--answered" : ""} ${isJust ? "brain-item--just-answered" : ""}`}
            style={{ paddingLeft: "var(--space-6)", paddingRight: "var(--space-6)", flexDirection: "column", alignItems: "stretch", padding: "var(--space-3) var(--space-6)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div className="brain-item__label" style={{ fontSize: "var(--text-base)", flex: 1 }}>
                <span style={{ minWidth: 40, fontWeight: 700, color: v !== undefined ? "var(--color-abnormal)" : "var(--color-text-muted)" }}>{item.index}.</span>
                <span>{item.question}</span>
              </div>
              {v !== undefined && <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: v === item.scores[1] ? "var(--color-abnormal)" : "var(--color-normal)" }}>{v === item.scores[1] ? `✓ 是 (+${v}分)` : "✓ 否"}</span>}
            </div>
            <div className="brain-radio-group" style={{ marginTop: "var(--space-2)" }}>
              {item.options.map((opt, oi) => {
                const pts = item.scores[oi];
                const on = v === pts;
                return (
                  <label key={oi} className={`brain-chip brain-chip--lg ${on && oi === 1 ? "brain-chip--on" : ""}`}
                    style={{ cursor: "pointer", opacity: on && oi === 0 ? 0.6 : 1, background: on && oi === 0 ? "var(--color-surface-sunken)" : undefined }}>
                    <input type="radio" name={`slanss-${item.index}`} checked={on} onChange={() => setSlanssItem(item.index, pts)} />
                    {opt}({pts}分)
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* 错误提示 */}
      {submitError && (
        <div className="field__error" style={{ padding: "var(--space-2) var(--space-3)", margin: "0 var(--space-6) var(--space-2)", background: "#fef2f2", borderRadius: "var(--radius-sm)", fontSize: 13, color: "#c33" }}>
          ❌ {submitError}
        </div>
      )}

      {/* 底部操作 */}
      <div className="brain-form__foot">
        <span className="brain-form__foot-status">
          {grandAnswered === grandTotal ? "✅ 已完成全部题目" : `⏳ 还需作答 ${grandTotal - grandAnswered} 题`}
        </span>
        <div className="brain-form__foot-actions">
          <button className="btn btn--primary" onClick={handleSubmit} disabled={grandAnswered !== grandTotal}
            style={{ fontSize: "var(--text-base)", fontWeight: 700, padding: "var(--space-2) var(--space-5)" }}>
            💾 提交疼痛评估
          </button>
        </div>
      </div>
    </div>
  );
}
