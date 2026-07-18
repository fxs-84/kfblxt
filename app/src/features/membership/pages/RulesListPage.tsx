/**
 * 积分规则列表页 — 治疗师/管理员可启用/禁用/编辑/复制
 */
import { useMemo, useState } from "react";
import { useRules } from "../hooks/useMembership";
import { ruleRepository } from "../rule.repository";
import { TRIGGER_LABEL } from "../models";
import type { PointsRule } from "../models";
import { useNavigate } from "react-router-dom";
import { toast } from "../../../lib/toast";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";

export function RulesListPage() {
  const [rules, reload] = useRules();
  const navigate = useNavigate();
  const [pendingDelete, setPendingDelete] = useState<PointsRule | null>(null);

  const toggle = async (r: PointsRule) => {
    await ruleRepository.update(r.id, { enabled: !r.enabled });
    await reload();
  };

  const duplicate = async (r: PointsRule) => {
    const copy = {
      ...r,
      id: `custom_${Date.now()}`,
      name: `${r.name} (副本)`,
      builtin: false,
      enabled: false,
    };
    await ruleRepository.create(copy);
    await reload();
  };

  const remove = (r: PointsRule) => {
    if (r.builtin) { toast.warning("系统预设规则不可删除,可禁用"); return; }
    setPendingDelete(r);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, gap: 8, alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button type="button" onClick={() => navigate("/membership/dashboard")} style={{
            padding: "4px 10px", background: "transparent",
            border: "1px solid var(--color-border)", borderRadius: 4, cursor: "pointer", fontSize: 12,
          }}>← 返回会员中心</button>
          <h2 style={{ margin: 0, fontSize: 18 }}>积分规则 ({rules.length})</h2>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" onClick={() => navigate("/membership/tiers")} style={{
            padding: "6px 12px", background: "transparent",
            border: "1px solid var(--color-border)", borderRadius: 4, cursor: "pointer", fontSize: 12,
          }}>等级配置</button>
          <button type="button" onClick={() => navigate("/membership/test")} style={{
            padding: "6px 12px", background: "transparent",
            border: "1px solid var(--color-border)", borderRadius: 4, cursor: "pointer", fontSize: 12,
          }}>测试沙盒</button>
          <button type="button" onClick={() => navigate("/membership/rules/new")} style={{
            padding: "6px 14px", background: "var(--color-accent)",
            color: "white", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 600,
          }}>+ 新建规则</button>
        </div>
      </div>

      {rules.length === 0 && <p style={{ color: "var(--color-text-muted)" }}>暂无规则</p>}

      {useMemo(() => [...rules].sort((a, b) => b.priority - a.priority), [rules]).map(r => (
        <div key={r.id} style={{
          padding: 12,
          border: "1px solid var(--color-border)",
          borderRadius: 6,
          marginBottom: 8,
          opacity: r.enabled ? 1 : 0.5,
          background: r.builtin ? "var(--color-surface-sunken, #f9fafb)" : "var(--color-surface)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</span>
                {r.builtin && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: "var(--color-accent-weak, #e6f0fa)", color: "var(--color-accent)" }}>预设</span>}
                <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>优先级 {r.priority}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                触发: <strong>{TRIGGER_LABEL[r.trigger]}</strong>
                {r.conditions.length > 0 && <> · 条件: {r.conditions.length} 条</>}
                {r.cooldownDays > 0 && <> · 冷却 {r.cooldownDays} 天</>}
                {r.maxPerPatient > 0 && <> · 每客户最多 {r.maxPerPatient} 次</>}
              </div>
              <div style={{ fontSize: 12, marginTop: 2 }}>
                动作: <strong>{describeAction(r)}</strong>
              </div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button type="button" onClick={() => toggle(r)} style={{
                padding: "3px 10px", fontSize: 11, background: "transparent",
                border: "1px solid var(--color-border)", borderRadius: 4, cursor: "pointer",
              }}>{r.enabled ? "禁用" : "启用"}</button>
              <button type="button" onClick={() => navigate(`/membership/rules/${r.id}`)} style={{
                padding: "3px 10px", fontSize: 11, background: "transparent",
                border: "1px solid var(--color-border)", borderRadius: 4, cursor: "pointer",
              }}>编辑</button>
              <button type="button" onClick={() => duplicate(r)} style={{
                padding: "3px 10px", fontSize: 11, background: "transparent",
                border: "1px solid var(--color-border)", borderRadius: 4, cursor: "pointer",
              }}>复制</button>
              {!r.builtin && (
                <button type="button" onClick={() => remove(r)} style={{
                  padding: "3px 10px", fontSize: 11, background: "transparent",
                  border: "1px solid var(--color-abnormal)", color: "var(--color-abnormal)",
                  borderRadius: 4, cursor: "pointer",
                }}>删除</button>
              )}
            </div>
          </div>
        </div>
      ))}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="删除规则"
        message={pendingDelete ? `确定删除规则 "${pendingDelete.name}"?` : ""}
        confirmLabel="删除"
        danger
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (pendingDelete) {
            await ruleRepository.remove(pendingDelete.id);
            await reload();
          }
          setPendingDelete(null);
        }}
      />
    </div>
  );
}

function describeAction(r: PointsRule): string {
  if (r.action.kind === "award_fixed") return `+${r.action.points} 积分 (${r.action.reason})`;
  if (r.action.kind === "award_ratio") return `${r.action.pointsPerYuan} 积分/元 (${r.action.reason})`;
  if (r.action.kind === "set_tier") return `设为 ${r.action.tier} 等级`;
  return "未知动作";
}