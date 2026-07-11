import { useState, useEffect, useRef } from "react";
import { useDraftAutosave } from "../../exam/useDraftAutosave";
import { useTreatmentPlans, useCreateTreatmentPlan, useProgressNotes, useCreateProgressNote } from "../useTreatment";
import { INTERVENTIONS_CATALOG } from "../interventions-catalog";
import { INTERVENTION_CATEGORIES, TREATMENT_PHASES, OUTCOME_RATINGS, GOAL_TEMPLATES, GOAL_DOMAINS, type TreatmentPhase, type TreatmentGoal, type OutcomeRating } from "../treatment.types";
import type { TreatmentPlanRecord } from "../treatment.repository";
import { predictOutcome } from "../../agent/agent-utils";
import { formatDate } from "../../../lib/format";

interface TreatmentPanelProps { encounterId: string }

export function TreatmentPanel({ encounterId }: TreatmentPanelProps) {
  const { data: plans = [] } = useTreatmentPlans(encounterId);
  const createPlan = useCreateTreatmentPlan();
  const [showForm, setShowForm] = useState(false);
  const [phase, setPhase] = useState<TreatmentPhase>("急性期");
  const [frequency, setFrequency] = useState("");
  const [duration, setDuration] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [goals, setGoals] = useState<TreatmentGoal[]>([]);
  const [goalText, setGoalText] = useState<{ term: "short" | "long"; desc: string; metric: string }>({ term: "short", desc: "", metric: "" });
  const [boundaries, setBoundaries] = useState("");
  const [expandedCat, setExpandedCat] = useState<Set<string>>(new Set(["神经调控"]));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notePlanId, setNotePlanId] = useState<string | null>(null);
  const tpDraft = useDraftAutosave(
    "tp:" + encounterId,
    { phase: "急性期" as TreatmentPhase, frequency: "", duration: "", selectedIds: [] as string[], goals: [] as TreatmentGoal[], goalText: { term: "short" as "short" | "long", desc: "", metric: "" }, boundaries: "" },
  );
  const tpInit = useRef(false);
  // hydrate from draft
  if (tpDraft.value.frequency && !tpInit.current) {
    tpInit.current = true;
    setPhase(tpDraft.value.phase);
    setFrequency(tpDraft.value.frequency);
    setDuration(tpDraft.value.duration);
    setSelectedIds(new Set(tpDraft.value.selectedIds));
    setGoals(tpDraft.value.goals);
    setGoalText(tpDraft.value.goalText);
    setBoundaries(tpDraft.value.boundaries);
  }
  // 草稿自动同步
  useEffect(() => {
    tpDraft.setValue({ phase, frequency, duration, selectedIds: [...selectedIds], goals, goalText, boundaries });
  }, [phase, frequency, duration, JSON.stringify([...selectedIds]), JSON.stringify(goals), JSON.stringify(goalText), boundaries]);

  const handleSave = async () => {
    if (!frequency.trim()) { setError("请输入治疗频率"); return; }
    if (selectedIds.size === 0) { setError("请选择至少一项干预技术"); return; }
    if (goals.length === 0) { setError("请添加至少一个 SMART 目标"); return; }
    setError(null);
    setSaving(true);
    try {
      await createPlan.mutateAsync({
        encounterId, phase, frequency: frequency.trim(), duration: duration.trim(),
        interventionIds: [...selectedIds], goals,
        boundaries: boundaries.trim() || undefined,
      });
      setShowForm(false);
      setSelectedIds(new Set());
      setGoals([]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "保存失败,请重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card treatment-panel" style={{ marginBottom: "1.5rem" }}>
      <div className="exam-panel__header">
        <h3 className="panel__title">治疗计划</h3>
        {!showForm && <button className="btn btn--ghost" style={{ fontSize: "var(--text-xs)" }} onClick={() => setShowForm(true)}>+ 新建计划</button>}
      </div>

      {showForm && (
        <div style={{ padding: "var(--space-4) var(--space-6)" }}>
          <div className="form-grid form-grid--tight" style={{ padding: 0 }}>
            <div className="field">
              <label>治疗分期</label>
              <select value={phase} onChange={(e) => setPhase(e.target.value as TreatmentPhase)}>
                {TREATMENT_PHASES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div className="field">
              <label>频率</label>
              <input value={frequency} onChange={(e) => setFrequency(e.target.value)} placeholder="如:3-5次/周" />
            </div>
            <div className="field">
              <label>疗程</label>
              <input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="如:4周" />
            </div>
            <div className="field">
              <label>康复界限(可选)</label>
              <input value={boundaries} onChange={(e) => setBoundaries(e.target.value)} placeholder="如:3月无改善转诊手术" />
            </div>
          </div>

          {/* 干预选择 */}
          <div className="field" style={{ marginTop: "var(--space-4)" }}>
            <label>干预技术(可多选)</label>
            <div className="intervention-grid">
              {INTERVENTION_CATEGORIES.map((cat) => {
                const items = INTERVENTIONS_CATALOG.filter((d) => d.category === cat);
                const open = expandedCat.has(cat);
                return (
                  <div key={cat} className="int-cat">
                    <button type="button" className="int-cat__toggle"
                      onClick={() => { const n = new Set(expandedCat); if (n.has(cat)) n.delete(cat); else n.add(cat); setExpandedCat(n); }}>
                      {open ? "▾" : "▸"} {cat} ({items.length})
                    </button>
                    {open && (
                      <div className="int-cat__items">
                        {items.map((item) => (
                          <label key={item.id} className="chip">
                            <input type="checkbox" checked={selectedIds.has(item.id)}
                              onChange={() => { const n = new Set(selectedIds); if (n.has(item.id)) n.delete(item.id); else n.add(item.id); setSelectedIds(n); }} />
                            <span title={`${item.parameters}\n${item.indications}`}>{item.name}</span>
                            {item.pendingConfirmation && <span style={{ fontSize: "10px" }}>⚠</span>}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* SMART 目标 */}
          <div className="field" style={{ marginTop: "var(--space-4)" }}>
            <label>SMART 目标</label>
            <div className="goal-templates">
              {GOAL_DOMAINS.map((domain) => {
                const items = GOAL_TEMPLATES.filter((g) => g.domain === domain);
                return (
                  <div key={domain} className="goal-tpl-group">
                    <span className="goal-tpl-domain">{domain}</span>
                    {items.map((tpl) => {
                      const alreadyAdded = goals.some((g) => g.description === tpl.description);
                      return (
                        <button key={tpl.id} type="button"
                          className={`goal-tpl-chip ${alreadyAdded ? "goal-tpl-chip--added" : ""}`}
                          disabled={alreadyAdded}
                          onClick={() => setGoals([...goals, { term: tpl.term, description: tpl.description, metric: tpl.exampleMetric }])}
                          title={`${tpl.term === "short" ? "短期" : "长期"} · ${tpl.exampleMetric}`}
                        >
                          {tpl.description}
                          <span className="goal-tpl-metric">{tpl.exampleMetric}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
              <select value={goalText.term} onChange={(e) => setGoalText({ ...goalText, term: e.target.value as "short" | "long" })} style={{ width: 80 }}>
                <option value="short">短期</option>
                <option value="long">长期</option>
              </select>
              <input placeholder="自定义目标" value={goalText.desc} onChange={(e) => setGoalText({ ...goalText, desc: e.target.value })} style={{ flex: 1 }} />
              <input placeholder="指标(可选)" value={goalText.metric} onChange={(e) => setGoalText({ ...goalText, metric: e.target.value })} style={{ width: 120 }} />
              <button type="button" className="btn btn--ghost" onClick={() => {
                if (goalText.desc.trim()) { setGoals([...goals, { term: goalText.term, description: goalText.desc.trim(), metric: goalText.metric || undefined }]); setGoalText({ term: "short", desc: "", metric: "" }); }
              }}>+添加</button>
            </div>

            {goals.length > 0 && (
              <div className="goal-list" style={{ marginTop: "var(--space-2)" }}>
                {goals.map((g, i) => (
                  <div key={i} className="goal-item">
                    <span className={`badge badge--${g.term === "short" ? "caution" : "normal"}`} style={{ marginRight: 6 }}>{g.term === "short" ? "短期" : "长期"}</span>
                    {g.description} {g.metric && <span style={{ color: "var(--color-text-muted)" }}>({g.metric})</span>}
                    <button type="button" className="btn btn--ghost" style={{ padding: "0 4px", fontSize: "12px", marginLeft: 6 }}
                      onClick={() => setGoals(goals.filter((_, j) => j !== i))}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <div className="field__error" style={{ marginTop: "var(--space-3)" }}>{error}</div>}

          <div className="form-actions" style={{ padding: "var(--space-4) 0 0" }}>
            <button className="btn btn--primary" disabled={saving} onClick={handleSave}>
              {saving ? "保存中…" : "保存治疗计划"}
            </button>
            <button className="btn btn--ghost" onClick={() => setShowForm(false)}>取消</button>
          </div>
        </div>
      )}

      {/* 已有计划列表 */}
      {plans.length > 0 && (
        <div className="plan-list">
          {plans.map((plan) => (
            <TreatmentPlanCard key={plan.id} plan={plan}
              onNote={notePlanId === plan.id ? null : () => setNotePlanId(plan.id)} />
          ))}
        </div>
      )}

      {notePlanId && (() => { const activePlan = plans.find((p) => p.id === notePlanId); return (
        <ProgressNoteForm planId={notePlanId} encounterId={encounterId} interventionIds={activePlan?.interventionIds ?? []} onDone={() => setNotePlanId(null)} />
      );})()}
    </div>
  );
}

function TreatmentPlanCard({ plan, onNote }: { plan: TreatmentPlanRecord; onNote: (() => void) | null }) {
  const { data: notes = [] } = useProgressNotes(plan.id);
  const items = plan.interventionIds.map((id) => INTERVENTIONS_CATALOG.find((d) => d.id === id)?.name ?? id);
  return (
    <div className="plan-card">
      <div className="plan-card__head">
        <span className={`badge badge--${plan.phase === "急性期" ? "abnormal" : plan.phase === "恢复期" ? "caution" : plan.phase === "巩固期" ? "caution" : "normal"}`}>{plan.phase}</span>
        <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginLeft: "var(--space-2)" }}>{plan.frequency} · {plan.duration}</span>
        <span style={{ marginLeft: "auto", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>{formatDate(plan.createdAt)}</span>
      </div>
      <div className="plan-card__body">
        <div className="plan-card__interventions">
          {items.map((name, i) => <span key={i} className="exam-summary__item">{name}</span>)}
        </div>
        {plan.goals.length > 0 && (
          <div className="plan-card__goals">
            {plan.goals.map((g: TreatmentGoal, i: number) => (
              <div key={i}>→ {g.description} {g.metric && <span style={{ color: "var(--color-text-muted)" }}>({g.metric})</span>}</div>
            ))}
          </div>
        )}
        {plan.boundaries && <div className="plan-card__boundary">⚠ 康复界限: {plan.boundaries}</div>}
      </div>
      {notes.length > 0 && (
        <div className="plan-card__notes">
          {notes.map((n) => (
            <span key={n.id} className={`badge badge--${n.outcome === "显效" || n.outcome === "有效" ? "normal" : n.outcome === "恶化" ? "abnormal" : "caution"}`}>
              {n.node}:{n.outcome}{n.vasAfter !== undefined ? ` VAS ${n.vasAfter}` : ""}
            </span>
          ))}
        </div>
      )}
      {onNote && <button className="btn btn--ghost" style={{ marginTop: "var(--space-2)", fontSize: "var(--text-xs)" }} onClick={onNote}>+ 疗效复评</button>}
    </div>
  );
}

interface ProgressNoteFormProps { planId: string; encounterId: string; interventionIds: string[]; onDone: () => void; }
function ProgressNoteForm({ planId, encounterId, interventionIds, onDone }: ProgressNoteFormProps) {
  const createNote = useCreateProgressNote();
  const [node, setNode] = useState<"立即" | "短期" | "长期">("立即");
  const [vasAfter, setVasAfter] = useState<number | undefined>();
  const [outcome, setOutcome] = useState<OutcomeRating>("有效");
  const [adjustment, setAdjustment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prediction = interventionIds.length > 0 ? predictOutcome(interventionIds) : null;

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await createNote.mutateAsync({ treatmentPlanId: planId, encounterId, node, vasAfter, outcome, adjustment: adjustment || undefined });
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "保存失败,请重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: "var(--space-3) var(--space-6) var(--space-4)", borderTop: "1px solid var(--color-border)", background: "var(--color-surface-sunken)" }}>
      <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", flexWrap: "wrap" }}>
        <select value={node} onChange={(e) => setNode(e.target.value as "立即" | "短期" | "长期")} className="exam-grade">
          <option value="立即">立即复评</option>
          <option value="短期">短期复评</option>
          <option value="长期">长期复评</option>
        </select>
        <input type="number" className="exam-number" placeholder="VAS" min={0} max={10} value={vasAfter ?? ""}
          onChange={(e) => setVasAfter(e.target.value === "" ? undefined : Number(e.target.value))} />
        <select value={outcome} onChange={(e) => setOutcome(e.target.value as OutcomeRating)} className="exam-grade">
          {OUTCOME_RATINGS.map((r) => <option key={r}>{r}</option>)}
        </select>
        <input placeholder="调整方案(可选)" value={adjustment} onChange={(e) => setAdjustment(e.target.value)}
          style={{ flex: 1, minWidth: 120, padding: "2px 4px", border: "1px solid var(--color-border)", borderRadius: 4, fontSize: "var(--text-xs)" }} />
        {prediction && prediction.predicted !== "不确定" && (
          <span className="badge badge--caution" style={{ fontSize: "10px" }} title={prediction.basis}>
            🧠 预判:{prediction.predicted}({Math.round(prediction.confidence * 100)}%)
          </span>
        )}
        <button className="btn btn--primary" style={{ fontSize: "var(--text-xs)", padding: "2px 12px" }}
          disabled={saving} onClick={handleSave}>{saving ? "…" : "保存复评"}</button>
        <button className="btn btn--ghost" style={{ fontSize: "var(--text-xs)", padding: "2px 8px" }} onClick={onDone}>取消</button>
      </div>
      {error && <div className="field__error" style={{ marginTop: "var(--space-1)" }}>{error}</div>}
    </div>
  );
}
