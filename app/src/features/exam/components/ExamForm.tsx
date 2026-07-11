import { useState, useMemo, useEffect } from "react";
import { useDraftAutosave } from "../useDraftAutosave";
import { useCreateExamSession } from "../useExam";
import { EXAM_CATALOG } from "../exam-catalog";
import { EXAM_CATEGORIES, CATEGORY_LABELS, type ExamCategory, type ExamResult, type ExamDataType } from "../exam.types";
import { getExamFrequency, recordExamUsage, recordLastExam } from "../../agent/agent-memory";

interface ExamFormProps {
  encounterId: string;
  onDone: () => void;
}

/** 根据数据类型渲染输入控件 */
function ExamField({
  side,
  dataType,
  options,
  value,
  onChange,
}: {
  defId: string;
  label: string;
  side: "both" | "single" | "none";
  dataType: ExamDataType;
  options?: readonly string[];
  value: ExamResult;
  onChange: (result: ExamResult) => void;
}) {
  const setSide = (s: "left" | "right" | "value", val: unknown) => {
    const next = { ...value };
    if (side === "single") next.value = val;
    else if (s === "left") next.left = val;
    else next.right = val;
    onChange(next);
  };

  if (dataType === "pos-neg") {
    return (
      <span className="exam-posneg">
        {side !== "single" && (
          <label className="exam-side">
            <span className="exam-side__label">左</span>
            <input type="checkbox" checked={!!value.left}
              onChange={(e) => setSide("left", e.target.checked || undefined)} />
          </label>
        )}
        {side !== "single" && (
          <label className="exam-side">
            <span className="exam-side__label">右</span>
            <input type="checkbox" checked={!!value.right}
              onChange={(e) => setSide("right", e.target.checked || undefined)} />
          </label>
        )}
        {side === "single" && (
          <label className="exam-side">
            <span className="exam-side__label">阳</span>
            <input type="checkbox" checked={!!value.value}
              onChange={(e) => setSide("value", e.target.checked || undefined)} />
          </label>
        )}
      </span>
    );
  }

  const gradeOptions = dataType === "grade-0-4"
    ? ["0", "1", "2", "3", "4"]
    : dataType === "grade-0-5"
      ? ["0", "1", "2", "3", "4", "5"]
      : null;

  if (gradeOptions) {
    return (
      <span className="exam-posneg">
        {side !== "single" ? (
          <>
            <select className="exam-grade" value={String(value.left ?? "")}
              onChange={(e) => setSide("left", e.target.value === "" ? undefined : Number(e.target.value))}>
              <option value="">左—</option>
              {gradeOptions.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <select className="exam-grade" value={String(value.right ?? "")}
              onChange={(e) => setSide("right", e.target.value === "" ? undefined : Number(e.target.value))}>
              <option value="">右—</option>
              {gradeOptions.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </>
        ) : (
          <select className="exam-grade" value={String(value.value ?? "")}
            onChange={(e) => setSide("value", e.target.value === "" ? undefined : Number(e.target.value))}>
            <option value="">—</option>
            {gradeOptions.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        )}
      </span>
    );
  }

  if (dataType === "select" && options) {
    return (
      <span className="exam-posneg">
        {side !== "single" ? (
          <>
            <select className="exam-grade" value={String(value.left ?? "")}
              onChange={(e) => setSide("left", e.target.value || undefined)}>
              <option value="">左—</option>
              {options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <select className="exam-grade" value={String(value.right ?? "")}
              onChange={(e) => setSide("right", e.target.value || undefined)}>
              <option value="">右—</option>
              {options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </>
        ) : (
          <select className="exam-grade" value={String(value.value ?? "")}
            onChange={(e) => setSide("value", e.target.value || undefined)}>
            <option value="">—</option>
            {options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
      </span>
    );
  }

  if (dataType === "number" || dataType === "seconds") {
    return (
      <span className="exam-posneg">
        {side !== "single" ? (
          <>
            <input className="exam-number" type="number" placeholder="左"
              value={value.left !== undefined ? String(value.left) : ""}
              onChange={(e) => setSide("left", e.target.value === "" ? undefined : Number(e.target.value))} />
            <input className="exam-number" type="number" placeholder="右"
              value={value.right !== undefined ? String(value.right) : ""}
              onChange={(e) => setSide("right", e.target.value === "" ? undefined : Number(e.target.value))} />
          </>
        ) : (
          <input className="exam-number" type="number" placeholder="值"
            value={value.value !== undefined ? String(value.value) : ""}
            onChange={(e) => setSide("value", e.target.value === "" ? undefined : Number(e.target.value))} />
        )}
      </span>
    );
  }

  return (
    <input className="exam-number" style={{ width: "100%" }} placeholder="备注"
      value={typeof value.value === "string" ? value.value : ""}
      onChange={(e) => setSide("value", e.target.value || undefined)} />
  );
}

export function ExamForm({ encounterId, onDone }: ExamFormProps) {
  const createExam = useCreateExamSession();
  // 草稿自动保存 — 跨页面/刷新不丢数据
  const draft = useDraftAutosave<{ results: Record<string, ExamResult> }>(
    `exam:${encounterId}`,
    { results: {} }
  );
  const [results, setResults] = useState<Record<string, ExamResult>>(draft.value.results);
  const [expanded, setExpanded] = useState<Set<ExamCategory>>(new Set(["原始反射", "反射"]));
  const [saving, setSaving] = useState(false);

  // 同步 results → draft(每次 setResults 后 600ms 写 localStorage)
  useEffect(() => {
    draft.setValue({ results });
  }, [results]);
  // eslint-disable-next-line react-hooks/exhaustive-deps

  const toggleCat = (cat: ExamCategory) => {
    const next = new Set(expanded);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    setExpanded(next);
  };

  /* P2: 按使用频率排序查体项(常用排前面) + 高亮 */
  const examFreq = useMemo(() => getExamFrequency(), []);
  const itemsByCategory = useMemo(() => {
    const map = new Map<ExamCategory, Array<typeof EXAM_CATALOG[number]>>();
    for (const cat of EXAM_CATEGORIES) map.set(cat, []);
    for (const item of EXAM_CATALOG) {
      const arr = map.get(item.category);
      if (arr) arr.push(item);
    }
    // 按使用频率逆序排列(常用在前)
    for (const [_cat, items] of map) {
      items.sort((a, b) => (examFreq[b.id] ?? 0) - (examFreq[a.id] ?? 0));
    }
    return map;
  }, [examFreq]);

  const setResult = (id: string, r: ExamResult) => {
    setResults((prev) => {
      const hasStages = r.stages && Object.keys(r.stages).length > 0;
      if (!r.left && !r.right && !r.value && !r.note && !hasStages) {
        const { [id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: r };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    await createExam.mutateAsync({ encounterId, results });
    draft.clearDraft();
    // P2: 记录查体频率(供下次智能排序)
    const usedIds = Object.keys(results);
    if (usedIds.length > 0) {
      recordExamUsage(usedIds);
      recordLastExam(encounterId, usedIds);
    }
    onDone();
  };

  const countFilled = Object.keys(results).length;

  return (
    <div className="card exam-panel" style={{ marginBottom: "1.5rem" }}>
      <div className="exam-panel__header">
        <h3 className="panel__title">ANRM 神经科学查体</h3>
        <span className="panel__hint">{countFilled} 项已记录</span>
      {draft.hasDraft && (
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--color-caution, #d48c2c)", fontWeight: 500 }}>
          💾 草稿已自动保存 {draft.lastSavedAt ? new Date(draft.lastSavedAt).toLocaleTimeString() : ""}
          <button className="btn btn--ghost" style={{ fontSize: 10, marginLeft: 4 }} onClick={() => { draft.clearDraft(); setResults({}); }}>清空</button>
        </span>
      )}
      </div>

      <div className="exam-body">
        {[...itemsByCategory.entries()].map(([cat, items]) => {
          if (items.length === 0) return null;
          const open = expanded.has(cat);
          return (
            <div key={cat} className="exam-cat">
              <button type="button" className="exam-cat__toggle" onClick={() => toggleCat(cat)}
                aria-expanded={open}>
                <span className="exam-cat__chevron">{open ? "▾" : "▸"}</span>
                {CATEGORY_LABELS[cat]}
                <span className="exam-cat__count">{items.length}项</span>
              </button>
              {open && (
                <div className="exam-cat__body">
                  {items.map((item) => {
                    const val = results[item.id] ?? {};
                    const hasSubItems = !!item.subItems && item.subItems.length > 0;
                    return (
                      <div key={item.id} className={`exam-item${hasSubItems ? " exam-item--staged" : ""}`}>
                        <div className="exam-item__label">
                          <span>{item.name}</span>
                          {item.pendingConfirmation && <span className="exam-item__flag" title="待医师确认">⚠</span>}
                          {(examFreq[item.id] ?? 0) >= 3 && <span className="badge badge--normal" style={{ fontSize: "9px", marginLeft: 2 }} title={`已使用 ${examFreq[item.id]} 次`}>常用</span>}
                          {item.normalRef && <span className="exam-item__ref">{item.normalRef}</span>}
                        </div>
                        {hasSubItems ? (
                          <div className="exam-item__stages">
                            {item.subItems!.map((sub, idx) => (
                              <label key={idx} className="exam-stage">
                                <span className="exam-stage__label">{sub}</span>
                                <input
                                  className="exam-number"
                                  type="number"
                                  min="0"
                                  step="0.1"
                                  placeholder="秒"
                                  value={typeof val.stages?.[idx] === "number" ? String(val.stages![idx]) : ""}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    const stages = { ...(val.stages ?? {}) };
                                    if (v === "") delete stages[idx];
                                    else stages[idx] = Number(v);
                                    setResult(item.id, { ...val, stages });
                                  }}
                                />
                                <span className="exam-stage__unit">{item.unit ?? ""}</span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <ExamField
                            defId={item.id}
                            label={item.name}
                            side={item.side}
                            dataType={item.dataType}
                            options={item.options}
                            value={val}
                            onChange={(r) => setResult(item.id, r)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="form-actions" style={{ paddingTop: 0 }}>
        <button type="button" className="btn btn--primary" onClick={handleSave} disabled={saving}>
          {saving ? "保存中…" : "保存查体"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onDone}>取消</button>
      </div>
    </div>
  );
}
