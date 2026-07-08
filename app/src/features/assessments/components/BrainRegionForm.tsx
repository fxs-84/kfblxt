import { useMemo, useState } from "react";
import {
  BRAIN_REGION_DEFS,
  BRAIN_REGION_ITEMS,
  PHONE_EAR_OPTIONS,
  scoreBrainRegion,
  regionMaxScore,
  classifyRegionSeverity,
  REGION_SEVERITY_LABELS,
  type BrainRegionResponses,
  type PhoneEarPreference,
  type RegionSeverity,
} from "../scales/brain-region";
import { useCreateAssessment } from "../useAssessments";

interface BrainRegionFormProps {
  patientId: string;
  encounterId: string;
  onDone: () => void;
}

const SCORE_LABELS = ["无症状", "很少", "经常", "频繁", "总是"] as const;

/**
 * 大脑区域定位表填写表单(弹窗版,加大字体)。
 * - 顶部 sticky 进度条
 * - 16 个分区可折叠
 * - 每题 0-4 单选(第 46 题改为 3 选 1)
 * - 实时显示分区小计 + 严重度
 * - 提交时一次性写入 assessment 仓储
 */
export function BrainRegionForm({ patientId, encounterId, onDone }: BrainRegionFormProps) {
  const createAssessment = useCreateAssessment();

  const [items, setItems] = useState<Record<number, number>>({});
  const [phoneEar, setPhoneEar] = useState<PhoneEarPreference | null>(null);
  const [note, setNote] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(BRAIN_REGION_DEFS.map((d) => d.id)), // 弹窗空间大,默认全展开方便连续填写
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setItem = (index: number, value: number) => {
    setItems((prev) => ({ ...prev, [index]: value }));
  };

  const toggleRegion = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** 分区小计(实时) */
  const regionSubtotals = useMemo(() => {
    const map: Record<string, { score: number; max: number; count: number }> = {};
    for (const def of BRAIN_REGION_DEFS) {
      let score = 0;
      let count = 0;
      for (const item of BRAIN_REGION_ITEMS) {
        if (item.index < def.range[0] || item.index > def.range[1]) continue;
        if (item.index === 46) continue; // 单选,不计分
        const v = items[item.index];
        if (v !== undefined) {
          score += v;
          count += 1;
        }
      }
      map[def.id] = { score, max: regionMaxScore(def), count };
    }
    return map;
  }, [items]);

  const totalAnswered = useMemo(
    () => Object.values(items).filter((v) => v !== undefined).length,
    [items],
  );
  const totalQuestions = BRAIN_REGION_ITEMS.filter((i) => i.index !== 46).length;
  const isComplete = totalAnswered === totalQuestions;
  const progressPct = Math.round((totalAnswered / totalQuestions) * 100);

  const handleSave = async () => {
    setError(null);
    if (!isComplete) {
      setError(`还有 ${totalQuestions - totalAnswered} 题未作答,请补齐后再保存`);
      return;
    }
    const responses: BrainRegionResponses = { items, phoneEar };
    let score;
    try {
      score = scoreBrainRegion(responses);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "评分失败");
      return;
    }

    setSaving(true);
    try {
      await createAssessment.mutateAsync({
        patientId,
        encounterId,
        type: "brain_region",
        responses,
        score,
        phoneEar,
        note: note.trim() || undefined,
      });
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "保存失败,请重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="brain-form">
      {/* 顶部 sticky 进度条 */}
      <div className="brain-form-progress">
        <span>📝 已作答</span>
        <div className="brain-form-progress__track">
          <div
            className={`brain-form-progress__fill ${isComplete ? "brain-form-progress__fill--complete" : ""}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <span style={{ minWidth: 72, textAlign: "right" }}>
          <b style={{ color: isComplete ? "var(--color-normal)" : "var(--color-accent)" }}>{totalAnswered}</b>
          <span style={{ color: "var(--color-text-muted)" }}> / {totalQuestions}</span>
        </span>
      </div>

      {/* 评分标准说明 */}
      <div className="brain-form__hint">
        <div style={{ fontWeight: 700, marginBottom: 6, fontSize: "var(--text-base)" }}>📖 评分标准</div>
        请根据 <b>0-4</b> 的标准选择最适合的答案:
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", marginTop: 6 }}>
          {SCORE_LABELS.map((label, idx) => (
            <span key={idx} style={{ padding: "2px 10px", background: "var(--color-surface)", borderRadius: 999, border: "1px solid var(--color-border)" }}>
              <b style={{ color: "var(--color-accent)", fontSize: "var(--text-lg)" }}>{idx}</b>
              <span style={{ marginLeft: 4 }}>= {label}</span>
            </span>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
          部分题目标注 <b style={{ background: "#e3f2fd", color: "#1565c0", padding: "0 4px", borderRadius: 3 }}>L</b> = 左半球主控、<b style={{ background: "#fce4ec", color: "#c62828", padding: "0 4px", borderRadius: 3 }}>R</b> = 右半球主控。第 46 题改用「右耳/左耳/无偏好」三选一。
        </div>
      </div>

      {/* 分区列表 */}
      <div className="brain-form__body">
        <div className="exam-body">
          {BRAIN_REGION_DEFS.map((def) => {
            const open = expanded.has(def.id);
            const sub = regionSubtotals[def.id]!;
            const severity: RegionSeverity = classifyRegionSeverity(sub.score, sub.max);
            return (
              <div key={def.id} className="exam-cat brain-cat--lg">
                <button type="button" className="exam-cat__toggle" onClick={() => toggleRegion(def.id)} aria-expanded={open}>
                  <span className="exam-cat__chevron">{open ? "▾" : "▸"}</span>
                  <span style={{ flex: 1, textAlign: "left" }}>
                    {def.label}
                    {def.detail && <span style={{ color: "var(--color-text-muted)", fontWeight: 400, fontSize: "var(--text-sm)", marginLeft: 8 }}>{def.detail}</span>}
                  </span>
                  <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", marginRight: 10 }}>
                    小计 <b style={{ color: "var(--color-text)" }}>{sub.score}</b> / {sub.max}
                  </span>
                  <span
                    className={`brain-severity brain-severity--${severity}`}
                    title={`阈值:≥${sub.max}/4 即有问题`}
                    style={{ fontSize: "var(--text-sm)", padding: "2px 10px" }}
                  >
                    {severity === "severe" && "🔴 "}
                    {severity === "moderate" && "🟧 "}
                    {severity === "mild" && "🟡 "}
                    {REGION_SEVERITY_LABELS[severity]}
                  </span>
                </button>
                {open && (
                  <div className="exam-cat__body">
                    {BRAIN_REGION_ITEMS.filter((it) => it.index >= def.range[0] && it.index <= def.range[1]).map((item) => {
                      if (item.index === 46) {
                        // 第 46 题:三选一
                        return (
                          <div key={item.index} className="exam-item brain-item--lg brain-special-item">
                            <div className="exam-item__label">
                              <span style={{ minWidth: 32, color: "var(--color-text-muted)", fontWeight: 600 }}>{item.index}.</span>
                              <span>{item.text}</span>
                            </div>
                            <div className="brain-radio-group">
                              {PHONE_EAR_OPTIONS.map((opt) => (
                                <label
                                  key={opt.value}
                                  className={`brain-chip brain-chip--lg ${phoneEar === opt.value ? "brain-chip--on" : ""}`}
                                >
                                  <input
                                    type="radio"
                                    name="phone-ear"
                                    checked={phoneEar === opt.value}
                                    onChange={() => setPhoneEar(opt.value)}
                                  />
                                  {opt.label}
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      }
                      const v = items[item.index];
                      return (
                        <div key={item.index} className="exam-item brain-item--lg">
                          <div className="exam-item__label">
                            <span style={{ minWidth: 32, color: "var(--color-text-muted)", fontWeight: 600 }}>{item.index}.</span>
                            <span>{item.text}</span>
                            {item.side && <span className={`brain-side brain-side--${item.side}`} title={item.side === "L" ? "左半球主控" : "右半球主控"}>{item.side}</span>}
                          </div>
                          <div className="brain-radio-group">
                            {[0, 1, 2, 3, 4].map((n) => (
                              <label
                                key={n}
                                className={`brain-chip brain-chip--lg ${v === n ? "brain-chip--on" : ""}`}
                                title={SCORE_LABELS[n]}
                              >
                                <input
                                  type="radio"
                                  name={`q-${item.index}`}
                                  checked={v === n}
                                  onChange={() => setItem(item.index, n)}
                                />
                                {n}
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* 备注 */}
          <div className="field" style={{ marginTop: "var(--space-4)" }}>
            <label style={{ fontSize: "var(--text-base)", fontWeight: 600 }}>📝 备注(可选)</label>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="如:患者主诉最近 2 周记忆明显下降,已完成 MMSE 排除重度认知障碍"
              style={{ width: "100%", padding: "var(--space-3)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", font: "inherit", fontSize: "var(--text-base)", resize: "vertical", marginTop: 6 }}
            />
          </div>
        </div>
      </div>

      {/* 错误提示 + 底部 sticky 操作条 */}
      {error && <div className="field__error" style={{ margin: "var(--space-2) var(--space-6)" }}>{error}</div>}

      <div className="brain-form__foot">
        <span className="brain-form__foot-status">
          {isComplete ? "✅ 已完成全部题目,可保存" : `⏳ 还需作答 ${totalQuestions - totalAnswered} 题`}
        </span>
        <div className="brain-form__foot-actions">
          <button type="button" className="btn btn--ghost" onClick={onDone} disabled={saving} style={{ fontSize: "var(--text-base)" }}>
            取消
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleSave}
            disabled={saving || !isComplete}
            style={{ fontSize: "var(--text-base)", fontWeight: 700, padding: "var(--space-2) var(--space-5)" }}
          >
            {saving ? "保存中…" : isComplete ? "💾 保存问卷" : `还需 ${totalQuestions - totalAnswered} 题`}
          </button>
        </div>
      </div>
    </div>
  );
}