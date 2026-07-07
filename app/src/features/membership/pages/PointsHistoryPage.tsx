/**
 * 会员积分流水页 — 显示某个患者的所有积分变化记录
 * 每条: 时间 / 事件类型 / 增减数 / 操作后余额 / 操作人 / 关联事件
 */
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { usePatients } from "../../patients/usePatients";
import {
  findAllLogs,
  findAllRules,
  findAllTiers,
  getOrCreateMembership,
} from "../rule.repository";
import type { PatientMembership, PointsLog, PointsRule, TierConfig } from "../models";

const TRIGGER_LABEL: Record<string, string> = {
  "encounter.closed": "就诊结束奖励",
  "encounter.created": "新建就诊奖励",
  "diagnosis.created": "新建诊断奖励",
  "patient.created": "新患者奖励",
  "share.sent": "分享病历奖励",
  "patient.recommend": "推荐患者奖励",
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
              <div style={{ fontSize: 18 }}>¥{(membership.totalSpent / 100).toFixed(0)}</div>
            </div>
            <div style={{ marginLeft: "auto" }}>
              <Link to={`/membership/redeem/${patientId}`} className="btn btn--primary" style={{ textDecoration: "none" }}>
                🎁 发起兑换
              </Link>
            </div>
          </div>
        )}
      </div>

      <div className="card panel" data-testid="points-log">
        <div className="panel__head">
          <h3 className="panel__title">📜 积分流水 ({logs.length})</h3>
        </div>
        {loading ? <div className="empty">加载中…</div> :
         logs.length === 0 ? <div className="empty">暂无积分记录</div> :
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
              <th style={{ padding: "8px 6px" }}>时间</th>
              <th style={{ padding: "8px 6px" }}>事件</th>
              <th style={{ padding: "8px 6px" }}>规则</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>变动</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>余额</th>
              <th style={{ padding: "8px 6px" }}>备注</th>
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