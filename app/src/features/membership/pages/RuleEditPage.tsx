/**
 * 规则编辑器 — 可视化编辑
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ruleRepository,
  findRuleById,
  createRule,
  updateRule,
} from "../rule.repository";
import {
  TRIGGER_LABEL,
  TRIGGER_TYPES,
  CONDITION_FIELDS,
  CONDITION_OPS,
  CONDITION_FIELD_LABEL,
  CONDITION_OP_LABEL,
  MEMBER_TIERS,
  type PointsRule,
  type RuleCondition,
  type RuleAction,
  type TriggerType,
} from "../models";

export function RuleEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;
  const [rule, setRule] = useState<PointsRule | null>(null);
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => {
    if (isNew) {
      setRule({
        id: `custom_${Date.now()}`,
        name: "新规则",
        enabled: false,
        builtin: false,
        trigger: "encounter.closed",
        conditions: [],
        action: { kind: "award_fixed", points: 10, reason: "新规则" },
        cooldownDays: 0,
        maxPerPatient: 0,
        priority: 0,
        order: 99,
        validFrom: null,
        validUntil: null,
      });
      setLoading(false);
    } else {
      void findRuleById(id!).then(r => {
        setRule(r);
        setLoading(false);
      });
    }
  }, [id, isNew]);

  if (loading || !rule) return <div style={{ padding: 24 }}>加载中...</div>;

  const save = async () => {
    if (!rule.name.trim()) { alert("请输入规则名称"); return; }
    if (isNew) {
      await createRule(rule);
    } else {
      await updateRule(rule.id, rule);
    }
    navigate("/membership/rules");
  };

  const update = <K extends keyof PointsRule>(k: K, v: PointsRule[K]) => setRule({ ...rule, [k]: v });
  const updateAction = (a: RuleAction) => setRule({ ...rule, action: a });
  const addCondition = () => setRule({ ...rule, conditions: [...rule.conditions, { field: "patient.tier", op: "eq", value: "regular" }] });
  const removeCondition = (i: number) => setRule({ ...rule, conditions: rule.conditions.filter((_, idx) => idx !== i) });
  const updateCondition = (i: number, c: RuleCondition) => {
    const cs = [...rule.conditions];
    cs[i] = c;
    setRule({ ...rule, conditions: cs });
  };

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <h2 style={{ marginTop: 0 }}>{isNew ? "新建规则" : "编辑规则"}</h2>

      <Field label="规则名称">
        <input value={rule.name} onChange={e => update("name", e.target.value)} style={inputStyle} />
      </Field>

      <Field label="启用">
        <input type="checkbox" checked={rule.enabled} onChange={e => update("enabled", e.target.checked)} />
      </Field>

      <Field label="触发事件">
        <select value={rule.trigger} onChange={e => update("trigger", e.target.value as TriggerType)} style={inputStyle}>
          {TRIGGER_TYPES.map(t => <option key={t} value={t}>{TRIGGER_LABEL[t]}</option>)}
        </select>
      </Field>

      <Field label="条件(全部满足才触发)">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rule.conditions.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 4 }}>
              <select value={c.field} onChange={e => updateCondition(i, { ...c, field: e.target.value as typeof c.field })} style={selectStyle}>
                {CONDITION_FIELDS.map(f => <option key={f} value={f}>{CONDITION_FIELD_LABEL[f]}</option>)}
              </select>
              <select value={c.op} onChange={e => updateCondition(i, { ...c, op: e.target.value as typeof c.op })} style={selectStyle}>
                {CONDITION_OPS.map(o => <option key={o} value={o}>{CONDITION_OP_LABEL[o]}</option>)}
              </select>
              <input
                value={String(c.value)}
                onChange={e => updateCondition(i, { ...c, value: isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value) })}
                style={inputStyle}
              />
              <button type="button" onClick={() => removeCondition(i)} style={{ ...btnGhost, color: "var(--color-abnormal)" }}>✕</button>
            </div>
          ))}
          <button type="button" onClick={addCondition} style={{ ...btnGhost, alignSelf: "flex-start" }}>+ 添加条件</button>
        </div>
      </Field>

      <Field label="动作">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label>
            <input
              type="radio" checked={rule.action.kind === "award_fixed"}
              onChange={() => updateAction({ kind: "award_fixed", points: 10, reason: "新规则" })}
            /> 增加固定积分
          </label>
          <label>
            <input
              type="radio" checked={rule.action.kind === "award_ratio"}
              onChange={() => updateAction({ kind: "award_ratio", pointsPerYuan: 1, reason: "消费积分" })}
            /> 消费返积分(每元多少积分)
          </label>
          <label>
            <input
              type="radio" checked={rule.action.kind === "set_tier"}
              onChange={() => updateAction({ kind: "set_tier", tier: "silver" })}
            /> 设置等级
          </label>

          {rule.action.kind === "award_fixed" && rule.action.kind === "award_fixed" && (
            <div style={{ paddingLeft: 20 }}>
              <FixedActionForm action={rule.action} updateAction={updateAction} inputStyle={inputStyle} />
            </div>
          )}
          {rule.action.kind === "award_ratio" && rule.action.kind === "award_ratio" && (
            <div style={{ paddingLeft: 20 }}>
              <RatioActionForm action={rule.action} updateAction={updateAction} inputStyle={inputStyle} />
            </div>
          )}
          {rule.action.kind === "set_tier" && (
            <div style={{ paddingLeft: 20 }}>
              <select
                value={rule.action.tier}
                onChange={e => updateAction({ kind: "set_tier", tier: e.target.value as "regular" | "silver" | "gold" | "diamond" })}
                style={selectStyle}
              >
                {MEMBER_TIERS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}
        </div>
      </Field>

      <Field label="限制">
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span>冷却期(天):</span>
          <input type="number" value={rule.cooldownDays} onChange={e => update("cooldownDays", parseInt(e.target.value, 10) || 0)} style={{ ...inputStyle, width: 80 }} />
          <span>每客户最多(次):</span>
          <input type="number" value={rule.maxPerPatient} onChange={e => update("maxPerPatient", parseInt(e.target.value, 10) || 0)} style={{ ...inputStyle, width: 80 }} />
        </div>
      </Field>

      <Field label="优先级(数字大先匹配)">
        <input type="number" value={rule.priority} onChange={e => update("priority", parseInt(e.target.value, 10) || 0)} style={{ ...inputStyle, width: 120 }} />
      </Field>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button type="button" onClick={save} style={{ ...btnPrimary, padding: "8px 20px" }}>保存</button>
        <button type="button" onClick={() => navigate("/membership/rules")} style={btnGhost}>取消</button>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = { width: "100%", padding: "6px 8px", fontSize: 13, border: "1px solid var(--color-border)", borderRadius: 4, fontFamily: "inherit" };
const selectStyle: React.CSSProperties = { padding: "6px 8px", fontSize: 13, border: "1px solid var(--color-border)", borderRadius: 4 };
const btnGhost: React.CSSProperties = { padding: "4px 12px", background: "transparent", border: "1px solid var(--color-border)", borderRadius: 4, cursor: "pointer", fontSize: 13 };
const btnPrimary: React.CSSProperties = { padding: "6px 14px", background: "var(--color-accent)", color: "white", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 600 };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, color: "var(--color-text-muted)" }}>{label}</label>
      {children}
    </div>
  );
}

function FixedActionForm({ action, updateAction, inputStyle }: {
  action: { kind: "award_fixed"; points: number; reason: string };
  updateAction: (a: RuleAction) => void;
  inputStyle: React.CSSProperties;
}) {
  return (
    <>
      <input
        type="number"
        value={action.points}
        onChange={e => updateAction({ kind: "award_fixed", points: parseInt(e.target.value, 10) || 0, reason: action.reason })}
        style={{ ...inputStyle, width: 120 }}
      /> 积分
      <input
        value={action.reason}
        onChange={e => updateAction({ kind: "award_fixed", points: action.points, reason: e.target.value })}
        placeholder="原因(治疗师可见)"
        style={{ ...inputStyle, marginTop: 6 }}
      />
    </>
  );
}

function RatioActionForm({ action, updateAction, inputStyle }: {
  action: { kind: "award_ratio"; pointsPerYuan: number; reason: string };
  updateAction: (a: RuleAction) => void;
  inputStyle: React.CSSProperties;
}) {
  return (
    <>
      <input
        type="number" step="0.1"
        value={action.pointsPerYuan}
        onChange={e => updateAction({ kind: "award_ratio", pointsPerYuan: parseFloat(e.target.value) || 0, reason: action.reason })}
        style={{ ...inputStyle, width: 120 }}
      /> 积分/元
      <input
        value={action.reason}
        onChange={e => updateAction({ kind: "award_ratio", pointsPerYuan: action.pointsPerYuan, reason: e.target.value })}
        style={{ ...inputStyle, marginTop: 6 }}
      />
    </>
  );
}