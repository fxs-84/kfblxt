/**
 * 会员积分流水页 — 显示某个客户的所有积分变化记录
 * 每条: 时间 / 事件类型 / 增减数 / 操作后余额 / 操作人 / 关联事件
 * 顶部有"手动调整积分"按钮(转介绍 / 补偿 / 活动奖励等诊疗流程外场景)
 */
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { usePatients } from "../../patients/usePatients";
import { useAdjustPoints } from "../hooks/useMembership";
import {
  findAllLogs,
  findAllRules,
  findAllTiers,
  getOrCreateMembership,
} from "../rule.repository";
import type { PatientMembership, PointsLog, PointsRule, TierConfig } from "../models";

// 治疗师手动加分的预设原因(转介绍、补偿、活动奖励等诊疗流程外场景)
const MANUAL_REASON_PRESETS = [
  { label: "转介绍奖励", delta: 200 },
  { label: "活动奖励", delta: 100 },
  { label: "补偿调整", delta: 0 }, // 自由填
  { label: "客服致歉", delta: 50 },
  { label: "生日礼", delta: 100 },
];

const TRIGGER_LABEL: Record<string, string> = {
  "encounter.closed": "就诊结束奖励",
  "encounter.created": "新建就诊奖励",
  "diagnosis.created": "新建诊断奖励",
  "patient.created": "新客户奖励",
  "share.sent": "分享病历奖励",
  "patient.recommend": "推荐客户奖励",
  "manual": "手动调整",
};

export function PointsHistoryPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const { data: patients = [] } = usePatients();
  const [logs, setLogs] = useState<PointsLog[]>([]);
  const [membership, setMembership] = useState<PatientMembership | null>(null);
  const [tiers, setTiers] = useState<TierConfig[]>([]);
  const [rules, setRules] = useState<PointsRule[]>([]);
  const [loading, setLoading] = useState(true);

  // 手动调整积分 modal
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustReason, setAdjustReason] = useState(MANUAL_REASON_PRESETS[0].label);
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const adjustPoints = useAdjustPoints();

  useEffect(() => {
    if (!patientId) return;
    void (async () => {
      setLoading(true);
      const [allLogs, m, t, r] = await Promise.all([
        findAllLogs(),
        getOrCreateMembership(patientId),
        findAllTiers(),
        findAllRules(),
      ]);
      setLogs(allLogs.filter(l => l.patientId === patientId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setMembership(m);
      setTiers(t);
      setRules(r);
      setLoading(false);
    })();
  }, [patientId]);

  const patient = patients.find(p => p.id === patientId);
  const tier = membership ? tiers.find(t => t.tier === membership.tier) : null;

  return (
    <div style={{ padding: 24, maxWidth: 960 }}>
      <div style={{ marginBottom: 16 }}>
        <Link to="/membership/dashboard" style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          ← 返回会员中心
        </Link>
      </div>

      <div className="card panel" style={{ marginBottom: 16 }}>
        <div className="panel__head">
          <h2 className="panel__title">📊 积分流水 — {patient?.name ?? patientId?.slice(0, 8)}</h2>
        </div>
        {membership && (
          <div style={{ display: "flex", gap: 24, marginTop: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>等级</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{tier?.icon} {tier?.name ?? membership.tier}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>当前积分</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--color-accent)" }} data-testid="current-points">
                {membership.points.toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>累计获得</div>
              <div style={{ fontSize: 18 }}>{membership.totalEarned.toLocaleString()}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>累计消费</div>
              <div style={{ fontSize: 18 }}>¥{membership.totalSpent.toLocaleString("zh-CN")}</div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setAdjustDelta("");
                  setAdjustReason(MANUAL_REASON_PRESETS[0].label);
                  setAdjustError(null);
                  setAdjustOpen(true);
                }}
                data-testid="open-adjust"
              >
                ✏️ 手动调整
              </button>
              <Link to={`/membership/redeem/${patientId}`} className="btn btn--primary" style={{ textDecoration: "none" }}>
                🎁 发起兑换
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* 手动调整积分 modal */}
      {adjustOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="手动调整积分"
          data-testid="adjust-modal"
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          }}
          onClick={() => !adjustSubmitting && setAdjustOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "var(--color-surface, white)", borderRadius: 8, padding: 20,
              minWidth: 360, maxWidth: 480, boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>✏️ 手动调整积分</h3>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 12 }}>
              {patient?.name ?? patientId} · 当前 {membership?.points.toLocaleString() ?? 0} 分
            </div>

            <label style={{ display: "block", fontSize: 12, color: "var(--color-text-muted)", marginBottom: 4 }}>
              调整分数(正=加,负=减)
            </label>
            <input
              type="number"
              value={adjustDelta}
              onChange={e => setAdjustDelta(e.target.value)}
              placeholder="如 200 或 -50"
              data-testid="adjust-delta"
              autoFocus
              style={{
                width: "100%", padding: "6px 10px", fontSize: 14,
                border: "1px solid var(--color-border)", borderRadius: 4, marginBottom: 12,
              }}
            />

            <label style={{ display: "block", fontSize: 12, color: "var(--color-text-muted)", marginBottom: 4 }}>
              原因(必填,会写入积分流水)
            </label>
            <select
              value={adjustReason}
              onChange={e => {
                const reason = e.target.value;
                setAdjustReason(reason);
                // 选预设时自动填入推荐分值
                const preset = MANUAL_REASON_PRESETS.find(p => p.label === reason);
                if (preset && preset.delta !== 0 && !adjustDelta) {
                  setAdjustDelta(String(preset.delta));
                }
              }}
              data-testid="adjust-reason-preset"
              style={{
                width: "100%", padding: "6px 10px", fontSize: 13,
                border: "1px solid var(--color-border)", borderRadius: 4, marginBottom: 8,
              }}
            >
              {MANUAL_REASON_PRESETS.map(p => (
                <option key={p.label} value={p.label}>
                  {p.label}{p.delta > 0 ? ` (+${p.delta})` : ""}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={adjustReason.startsWith("__custom__") ? adjustReason.slice("__custom__:".length) : (MANUAL_REASON_PRESETS.some(p => p.label === adjustReason) ? "" : adjustReason)}
              onChange={e => setAdjustReason(`__custom__:${e.target.value}`)}
              placeholder="或自定义原因…"
              data-testid="adjust-reason-custom"
              style={{
                width: "100%", padding: "6px 10px", fontSize: 13,
                border: "1px solid var(--color-border)", borderRadius: 4, marginBottom: 12,
              }}
            />

            {adjustError && (
              <div style={{ padding: 8, background: "#fee2e2", color: "#991b1b", borderRadius: 4, marginBottom: 12, fontSize: 12 }}>
                {adjustError}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setAdjustOpen(false)}
                disabled={adjustSubmitting}
              >
                取消
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={adjustSubmitting}
                onClick={async () => {
                  if (!patientId) return;
                  const delta = parseInt(adjustDelta, 10);
                  if (!Number.isFinite(delta) || delta === 0) {
                    setAdjustError("请输入非零整数");
                    return;
                  }
                  const reasonRaw = adjustReason.startsWith("__custom__:")
                    ? adjustReason.slice("__custom__:".length).trim()
                    : adjustReason.trim();
                  if (!reasonRaw) {
                    setAdjustError("原因不能为空");
                    return;
                  }
                  setAdjustSubmitting(true);
                  setAdjustError(null);
                  try {
                    await adjustPoints(patientId, delta, reasonRaw);
                    // 刷新本页数据
                    const [allLogs, m] = await Promise.all([
                      findAllLogs(),
                      getOrCreateMembership(patientId),
                    ]);
                    setLogs(allLogs.filter(l => l.patientId === patientId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
                    setMembership(m);
                    setAdjustOpen(false);
                  } catch (e) {
                    setAdjustError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setAdjustSubmitting(false);
                  }
                }}
                data-testid="adjust-submit"
              >
                {adjustSubmitting ? "提交中…" : `确认${parseInt(adjustDelta, 10) > 0 ? "加" : "减"} ${Math.abs(parseInt(adjustDelta, 10) || 0)} 分`}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card panel" data-testid="points-log">
        <div className="panel__head">
          <h3 className="panel__title">📜 积分流水 ({logs.length})</h3>
        </div>
        {loading ? <div className="empty">加载中…</div> :
         logs.length === 0 ? <div className="empty">暂无积分记录</div> :
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
              <th scope="col" style={{ padding: "8px 6px" }}>时间</th>
              <th scope="col" style={{ padding: "8px 6px" }}>事件</th>
              <th scope="col" style={{ padding: "8px 6px" }}>规则</th>
              <th scope="col" style={{ padding: "8px 6px", textAlign: "right" }}>变动</th>
              <th scope="col" style={{ padding: "8px 6px", textAlign: "right" }}>余额</th>
              <th scope="col" style={{ padding: "8px 6px" }}>备注</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => {
              const rule = log.ruleId ? rules.find(r => r.id === log.ruleId) : null;
              const triggerLabel = log.triggerType ? (TRIGGER_LABEL[log.triggerType] ?? log.triggerType) : "手动";
              return (
                <tr key={log.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "8px 6px", color: "var(--color-text-muted)" }}>
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td style={{ padding: "8px 6px" }}>{triggerLabel}</td>
                  <td style={{ padding: "8px 6px", color: "var(--color-text-muted)" }}>
                    {rule?.name ?? "—"}
                  </td>
                  <td style={{
                    padding: "8px 6px", textAlign: "right", fontWeight: 700,
                    color: log.delta > 0 ? "#10b981" : "#ef4444",
                  }}>
                    {log.delta > 0 ? "+" : ""}{log.delta.toLocaleString()}
                  </td>
                  <td style={{ padding: "8px 6px", textAlign: "right", color: "var(--color-text-muted)" }}>
                    {log.balanceAfter.toLocaleString()}
                  </td>
                  <td style={{ padding: "8px 6px", color: "var(--color-text-muted)" }}>
                    {log.reason}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>}
      </div>
    </div>
  );
}