/**
 * 规则测试沙盒 — 模拟事件,看哪些规则会触发,得到多少积分
 */
import { useState, useEffect } from "react";
import { toast } from "../../../lib/toast";
import { findAllRules, getOrCreateMembership } from "../rule.repository";
import { processEvent } from "../rule-engine";
import type { PointsRule, TriggerEvent, MemberTier } from "../models";
import { TRIGGER_LABEL, MEMBER_TIERS } from "../models";

interface MatchResult {
  ruleId: string;
  ruleName: string;
  matched: boolean;
  reason?: string;
  expectedDelta?: number;
}

export function RuleTestPage() {
  const [rules, setRules] = useState<PointsRule[]>([]);
  const [patientId, setPatientId] = useState("");
  const [tier, setTier] = useState<MemberTier>("regular");
  const [amount, setAmount] = useState("100");
  const [results, setResults] = useState<MatchResult[]>([]);

  useEffect(() => {
    void findAllRules().then(setRules);
  }, []);

  const runTest = async (event: TriggerEvent) => {
    if (!patientId.trim()) { toast.warning("请输入客户 ID"); return; }
    // 临时设置客户 tier
    const m = await getOrCreateMembership(patientId.trim());
    const { updateMembership } = await import("../rule.repository");
    await updateMembership(patientId.trim(), { tier });

    const matches: MatchResult[] = [];
    for (const rule of rules) {
      if (!rule.enabled) continue;
      matches.push(await simulateRule(rule, event, patientId.trim(), tier, parseFloat(amount) || 0));
    }
    setResults(matches);
  };

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <h2 style={{ marginTop: 0 }}>规则测试沙盒</h2>
      <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
        输入客户 ID 和事件参数,查看所有规则会触发哪些。不修改真实积分数据。
      </p>

      <div style={{ padding: 16, border: "1px solid var(--color-border)", borderRadius: 6, marginTop: 16 }}>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
          <Field label="客户 ID">
            <input value={patientId} onChange={e => setPatientId(e.target.value)} placeholder="patient-uuid" style={inputStyle} />
          </Field>
          <Field label="当前等级">
            <select value={tier} onChange={e => setTier(e.target.value as MemberTier)} style={inputStyle}>
              {MEMBER_TIERS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="就诊金额(元,encounter.closed 用)">
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} style={inputStyle} />
          </Field>
        </div>

        <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 6 }}>
          <TestButton onClick={() => runTest({
            type: "encounter.closed", patientId: patientId.trim(),
            encounterId: "test", amount: parseFloat(amount) || 0, createdAt: new Date(),
          })}>完成就诊</TestButton>
          <TestButton onClick={() => runTest({
            type: "encounter.created", patientId: patientId.trim(),
            encounterId: "test", createdAt: new Date(),
          })}>创建就诊</TestButton>
          <TestButton onClick={() => runTest({
            type: "diagnosis.created", patientId: patientId.trim(),
            encounterId: "test", createdAt: new Date(),
          })}>完成诊断</TestButton>
          <TestButton onClick={() => runTest({
            type: "patient.created", patientId: patientId.trim(),
            createdAt: new Date(),
          })}>新建客户</TestButton>
          <TestButton onClick={() => runTest({
            type: "share.sent", patientId: patientId.trim(),
            shareToken: "test", createdAt: new Date(),
          })}>分享随访</TestButton>
          <TestButton onClick={() => runTest({
            type: "patient.recommend", patientId: patientId.trim(),
            refPatientId: "test-ref", createdAt: new Date(),
          })}>推荐客户</TestButton>
          <TestButton onClick={() => runTest({
            type: "patient.birthday", patientId: patientId.trim(),
            createdAt: new Date(),
          })}>生日</TestButton>
        </div>
      </div>

      {results.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h4 style={{ marginBottom: 8 }}>匹配结果 ({results.filter(r => r.matched).length}/{results.length})</h4>
          {results.map(r => (
            <div key={r.ruleId} style={{
              padding: 10,
              marginBottom: 6,
              border: "1px solid",
              borderColor: r.matched ? "var(--color-normal)" : "var(--color-border)",
              background: r.matched ? "var(--color-normal-weak, #ecfdf5)" : "transparent",
              borderRadius: 4,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 500 }}>{r.ruleName}</span>
                <span style={{ fontWeight: 700, color: r.matched ? "var(--color-normal)" : "var(--color-text-muted)" }}>
                  {r.matched ? `+${r.expectedDelta} 积分` : "未触发"}
                </span>
              </div>
              {r.reason && <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>{r.reason}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

async function simulateRule(
  rule: PointsRule,
  event: TriggerEvent,
  patientId: string,
  tier: MemberTier,
  amount: number,
): Promise<MatchResult> {
  if (!matchesTrigger(rule, event)) {
    return { ruleId: rule.id, ruleName: rule.name, matched: false, reason: "触发器不匹配" };
  }
  // 简化模拟 — 不模拟 cooldown / maxPerPatient
  // 计算预期积分
  let expectedDelta = 0;
  if (rule.action.kind === "award_fixed") {
    const multipliers: Record<MemberTier, number> = { regular: 1, silver: 1.2, gold: 1.5, diamond: 2 };
    expectedDelta = Math.round(rule.action.points * (multipliers[tier] || 1));
  } else if (rule.action.kind === "award_ratio") {
    expectedDelta = Math.round(amount * rule.action.pointsPerYuan);
  } else if (rule.action.kind === "set_tier") {
    return { ruleId: rule.id, ruleName: rule.name, matched: true, expectedDelta: 0, reason: `设为 ${rule.action.tier}` };
  }
  return { ruleId: rule.id, ruleName: rule.name, matched: true, expectedDelta };
}

function matchesTrigger(rule: PointsRule, event: TriggerEvent): boolean {
  if (rule.trigger === "encounter.nth") return event.type === "encounter.nth" || event.type === "encounter.created";
  if (rule.trigger === "patient.birthday") return event.type === "patient.birthday";
  return rule.trigger === event.type;
}

function TestButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: "6px 12px", fontSize: 12, background: "var(--color-accent-weak, #e6f0fa)",
      border: "1px solid var(--color-border)", borderRadius: 4, cursor: "pointer",
    }}>{children}</button>
  );
}

const inputStyle: React.CSSProperties = { width: "100%", padding: "6px 8px", fontSize: 13, border: "1px solid var(--color-border)", borderRadius: 4, fontFamily: "inherit" };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 2, color: "var(--color-text-muted)" }}>{label}</label>
      {children}
    </div>
  );
}

// suppress unused warning for TRIGGER_LABEL
void TRIGGER_LABEL;
// suppress unused processEvent import side effect
void processEvent;