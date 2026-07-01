import { useState, useEffect } from "react";
import { useDiagnosis, useCreateDiagnosis } from "../useDiagnosis";
import {
  NEURO_LEVELS, MECHANISMS, SPINAL_SEGMENTS, NERVE_TRUNKS, CUTANEOUS_NERVES,
  type NeuroLevel, type Mechanism, type SpinalSegment, type NerveTrunk,
  type LocalizationDiagnosis,
} from "../localization.types";
import { formatDate } from "../../../lib/format";

interface DiagnosisPanelProps { encounterId: string }

export function DiagnosisPanel({ encounterId }: DiagnosisPanelProps) {
  const { data: diagnosis, isLoading } = useDiagnosis(encounterId);
  const createDiagnosis = useCreateDiagnosis();
  const [showForm, setShowForm] = useState(false);
  const [levels, setLevels] = useState<Set<NeuroLevel>>(new Set());
  const [mechanisms, setMechanisms] = useState<Set<Mechanism>>(new Set());
  const [segments, setSegments] = useState<Set<SpinalSegment>>(new Set());
  const [nerves, setNerves] = useState<Set<NerveTrunk>>(new Set());
  const [cutaneousIds, setCutaneousIds] = useState<Set<string>>(new Set());
  const [side, setSide] = useState<LocalizationDiagnosis["side"]>("left");
  const [reasoning, setReasoning] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cutaneousOpen, setCutaneousOpen] = useState<Set<string>>(new Set(["颈枕部", "前臂"]));

  // 加载完成后:无诊断→自动展开表单;有诊断→初始状态填充已有值
  useEffect(() => {
    if (isLoading) return;
    if (!diagnosis) {
      setShowForm(true);
      return;
    }
    setLevels(new Set(diagnosis.levels));
    setMechanisms(new Set(diagnosis.mechanisms));
    if (diagnosis.segments) setSegments(new Set(diagnosis.segments));
    if (diagnosis.nerves) setNerves(new Set(diagnosis.nerves));
    if (diagnosis.cutaneousNerveIds) setCutaneousIds(new Set(diagnosis.cutaneousNerveIds));
    setSide(diagnosis.side);
    setReasoning(diagnosis.reasoning ?? "");
  }, [diagnosis, isLoading]);

  const handleSave = async () => {
    if (levels.size === 0 || mechanisms.size === 0) {
      setError("请至少选择一个神经水平和一种致病机制");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await createDiagnosis.mutateAsync({
        encounterId, levels: [...levels], mechanisms: [...mechanisms],
        segments: segments.size ? [...segments] : undefined,
        nerves: nerves.size ? [...nerves] : undefined,
        cutaneousNerveIds: cutaneousIds.size ? [...cutaneousIds] : undefined,
        side, reasoning,
      });
      setShowForm(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "保存失败,请重试");
    } finally {
      setSaving(false);
    }
  };

  const toggle = <T,>(set: Set<T>, v: T, setter: (s: Set<T>) => void) => {
    const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); setter(n);
  };

  // 摘要视图
  if (diagnosis && !showForm) {
    const selectedCutaneous = diagnosis.cutaneousNerveIds?.length
      ? diagnosis.cutaneousNerveIds.map((id) => {
          for (const g of Object.values(CUTANEOUS_NERVES)) {
            const found = g.find((c) => c.id === id);
            if (found) return found.name;
          }
          return id;
        }) : [];
    return (
      <div className="card panel" style={{ marginBottom: "var(--space-4)" }}>
        <div className="panel__head">
          <h3 className="panel__title">神经定位诊断</h3>
          <button className="btn btn--ghost" style={{ fontSize: "var(--text-xs)" }} onClick={() => setShowForm(true)}>编辑</button>
        </div>
        <div style={{ padding: "0 var(--space-5) var(--space-4)" }}>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginBottom: "var(--space-2)" }}>
            <span className="badge badge--abnormal">{side === "left" ? "左侧" : side === "right" ? "右侧" : side === "bilateral" ? "双侧" : "中线"}</span>
            {diagnosis.levels.map((l) => <span key={l} className="exam-summary__item exam-summary__item--pos">{l}</span>)}
          </div>
          {diagnosis.segments?.length ? <div className="diagnosis-line">节段: {diagnosis.segments.join("、")}</div> : null}
          {diagnosis.nerves?.length ? <div className="diagnosis-line">神经干: {diagnosis.nerves.join("、")}</div> : null}
          {selectedCutaneous.length ? <div className="diagnosis-line">皮神经敏化: {selectedCutaneous.join("、")}</div> : null}
          <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>机制: {diagnosis.mechanisms.join("、")}</div>
          {diagnosis.reasoning && (
            <div style={{ marginTop: "var(--space-2)", fontSize: "var(--text-sm)", fontStyle: "italic", borderLeft: "2px solid var(--color-accent)", paddingLeft: "var(--space-3)" }}>{diagnosis.reasoning}</div>
          )}
          <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginTop: "var(--space-2)" }}>{formatDate(diagnosis.createdAt)}</div>
        </div>
      </div>
    );
  }

  // 表单视图
  return (
    <div className="card" style={{ marginBottom: "var(--space-4)" }}>
      <div className="exam-panel__header">
        <h3 className="panel__title">神经定位诊断</h3>
        <span className="panel__hint">症状→水平→节段→神经→机制</span>
      </div>
      <div style={{ padding: "var(--space-4) var(--space-6)" }}>

        <div className="field" style={{ marginBottom: "var(--space-4)" }}>
          <label>侧别</label>
          <div className="chip-group">
            {(["left","right","bilateral","midline"] as const).map((s) => (
              <label key={s} className="chip" style={side === s ? { borderColor: "var(--color-accent)", background: "var(--color-accent-weak)" } : {}}>
                <input type="radio" name="side" value={s} checked={side === s} onChange={() => setSide(s)} />
                {s === "left" ? "左侧" : s === "right" ? "右侧" : s === "bilateral" ? "双侧" : "中线"}
              </label>
            ))}
          </div>
        </div>

        <div className="field" style={{ marginBottom: "var(--space-4)" }}>
          <label>神经水平定位 <span style={{ color: "var(--color-abnormal)" }}>*</span></label>
          <div className="chip-group">
            {NEURO_LEVELS.map((l) => (
              <label key={l} className="chip" style={levels.has(l) ? { borderColor: "var(--color-accent)", background: "var(--color-accent-weak)" } : {}}>
                <input type="checkbox" checked={levels.has(l)} onChange={() => toggle(levels, l, setLevels)} />{l}
              </label>
            ))}
          </div>
        </div>

        <div className="field" style={{ marginBottom: "var(--space-4)" }}>
          <label>致病机制 <span style={{ color: "var(--color-abnormal)" }}>*</span></label>
          <div className="chip-group">
            {MECHANISMS.map((m) => (
              <label key={m} className="chip" style={mechanisms.has(m) ? { borderColor: "var(--color-abnormal)", background: "var(--color-abnormal-weak)" } : {}}>
                <input type="checkbox" checked={mechanisms.has(m)} onChange={() => toggle(mechanisms, m, setMechanisms)} />{m}
              </label>
            ))}
          </div>
        </div>

        <div className="field" style={{ marginBottom: "var(--space-4)" }}>
          <label>脊髓节段</label>
          <div className="chip-group" style={{ maxHeight: 180, overflowY: "auto" }}>
            {SPINAL_SEGMENTS.map((s) => (
              <label key={s} className="chip" style={{ fontSize: "var(--text-xs)", padding: "1px 4px", ...(segments.has(s) ? { borderColor: "var(--color-abnormal)", background: "var(--color-abnormal-weak)" } : {}) }}>
                <input type="checkbox" checked={segments.has(s)} onChange={() => toggle(segments, s, setSegments)} />{s}
              </label>
            ))}
          </div>
        </div>

        <div className="field" style={{ marginBottom: "var(--space-4)" }}>
          <label>神经干</label>
          <div className="chip-group">
            {NERVE_TRUNKS.map((n) => (
              <label key={n} className="chip" style={{ fontSize: "var(--text-xs)", ...(nerves.has(n) ? { borderColor: "var(--color-accent)", background: "var(--color-accent-weak)" } : {}) }}>
                <input type="checkbox" checked={nerves.has(n)} onChange={() => toggle(nerves, n, setNerves)} />{n}
              </label>
            ))}
          </div>
        </div>

        <div className="field" style={{ marginBottom: "var(--space-4)" }}>
          <label>皮神经敏化(ANRM特色)</label>
          <div className="cutaneous-grid">
            {Object.entries(CUTANEOUS_NERVES).map(([group, items]) => {
              const open = cutaneousOpen.has(group);
              return (
                <div key={group} className="cutaneous-group">
                  <button type="button" className="cutaneous-group__toggle" onClick={() => toggle(cutaneousOpen, group, setCutaneousOpen)}>
                    <span className="cutaneous-group__chevron">{open ? "▾" : "▸"}</span>
                    {group}<span className="cutaneous-group__hint">{items.length}条</span>
                  </button>
                  {open && (
                    <div className="cutaneous-group__items">
                      {items.map((cn) => (
                        <label key={cn.id} className="chip" style={{ fontSize: "var(--text-xs)", ...(cutaneousIds.has(cn.id) ? { borderColor: "var(--color-abnormal)", background: "var(--color-abnormal-weak)" } : {}) }}
                          title={cn.sensitizationPoint ? `敏化点: ${cn.sensitizationPoint}` : undefined}>
                          <input type="checkbox" checked={cutaneousIds.has(cn.id)} onChange={() => toggle(cutaneousIds, cn.id, setCutaneousIds)} />
                          {cn.name}<span style={{ fontSize: "10px", color: "var(--color-text-muted)", marginLeft: 2 }}>({cn.segment})</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="field">
          <label>定位推理</label>
          <textarea rows={3} value={reasoning} onChange={(e) => setReasoning(e.target.value)}
            placeholder="如:左外踝后下方压痛+灼痛→腓肠神经(S1-S2)敏化;足外侧→S1皮区→L5/S1椎间盘突出"
            style={{ width: "100%", padding: "var(--space-2)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", font: "inherit", resize: "vertical" }} />
        </div>

        {error && <div className="field__error" style={{ marginTop: "var(--space-4)" }}>{error}</div>}

        <div className="form-actions" style={{ padding: "var(--space-4) 0 0" }}>
          <button className="btn btn--primary" disabled={saving} onClick={handleSave}>
            {saving ? "保存中…" : "保存定位诊断"}
          </button>
          {diagnosis && <button className="btn btn--ghost" onClick={() => setShowForm(false)}>取消</button>}
        </div>
      </div>
    </div>
  );
}
