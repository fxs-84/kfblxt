/**
 * 会员数据看板 — 统计概览
 */
import { useEffect, useState } from "react";
import {
  findAllMemberships,
  findAllLogs,
  findAllRedemptions,
  findAllTiers,
  findAllRules,
} from "../rule.repository";
import type { PatientMembership, PointsLog, Redemption, TierConfig, PointsRule } from "../models";

export function MembershipDashboard() {
  const [members, setMembers] = useState<PatientMembership[]>([]);
  const [logs, setLogs] = useState<PointsLog[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [tiers, setTiers] = useState<TierConfig[]>([]);
  const [rules, setRules] = useState<PointsRule[]>([]);

  useEffect(() => {
    void (async () => {
      setMembers(await findAllMemberships());
      setLogs(await findAllLogs());
      setRedemptions(await findAllRedemptions());
      setTiers(await findAllTiers());
      setRules(await findAllRules());
    })();
  }, []);

  const totalMembers = members.length;
  const totalPointsIssued = logs.filter(l => l.delta > 0).reduce((s, l) => s + l.delta, 0);
  const totalPointsRedeemed = logs.filter(l => l.delta < 0).reduce((s, l) => s + Math.abs(l.delta), 0);
  const pendingOrders = redemptions.filter(r => r.status === "pending").length;
  const fulfilledOrders = redemptions.filter(r => r.status === "fulfilled").length;

  // 等级分布
  const tierDist = tiers.map(t => ({
    tier: t,
    count: members.filter(m => m.tier === t.tier).length,
  }));

  // 最近 7 天积分发放
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 86_400_000;
  const recent = logs.filter(l => new Date(l.createdAt).getTime() > sevenDaysAgo);
  const recentEarn = recent.filter(l => l.delta > 0).reduce((s, l) => s + l.delta, 0);
  const recentRedeem = recent.filter(l => l.delta < 0).reduce((s, l) => s + Math.abs(l.delta), 0);

  // 最活跃触发规则
  const ruleHits = new Map<string, number>();
  for (const l of logs) {
    if (l.ruleId) ruleHits.set(l.ruleId, (ruleHits.get(l.ruleId) ?? 0) + 1);
  }
  const topRules = Array.from(ruleHits.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ rule: rules.find(r => r.id === id), count }))
    .filter(x => x.rule);

  // 最热门兑换
  const redemptionCounts = new Map<string, number>();
  for (const r of redemptions) {
    redemptionCounts.set(r.rewardName, (redemptionCounts.get(r.rewardName) ?? 0) + 1);
  }
  const topRewards = Array.from(redemptionCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginTop: 0 }}>会员数据看板</h2>

      {/* 核心指标 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        <StatCard label="会员总数" value={totalMembers.toString()} icon="👥" />
        <StatCard label="累计发放积分" value={totalPointsIssued.toLocaleString()} icon="📈" color="var(--color-normal)" />
        <StatCard label="累计兑换积分" value={totalPointsRedeemed.toLocaleString()} icon="📉" color="var(--color-caution, #f59e0b)" />
        <StatCard label="待审订单" value={pendingOrders.toString()} icon="⏳" color="var(--color-caution, #f59e0b)" />
        <StatCard label="已履约订单" value={fulfilledOrders.toString()} icon="✅" color="var(--color-normal)" />
      </div>

      {/* 7 天动态 */}
      <h4 style={{ marginBottom: 8 }}>最近 7 天</h4>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        <StatCard label="发放积分" value={recentEarn.toLocaleString()} icon="📈" color="var(--color-normal)" small />
        <StatCard label="兑换积分" value={recentRedeem.toLocaleString()} icon="📉" color="var(--color-caution, #f59e0b)" small />
      </div>

      {/* 等级分布 */}
      <h4 style={{ marginBottom: 8 }}>等级分布</h4>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {tierDist.map(({ tier, count }) => (
          <div key={tier.tier} style={{
            padding: "8px 14px",
            border: `2px solid ${tier.color}`,
            borderRadius: 8,
            minWidth: 100,
            background: `${tier.color}10`,
          }}>
            <div style={{ fontSize: 20 }}>{tier.icon}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{tier.name}</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{count}</div>
          </div>
        ))}
      </div>

      {/* 最活跃规则 */}
      {topRules.length > 0 && (
        <>
          <h4 style={{ marginBottom: 8 }}>最活跃规则</h4>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 16 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--color-border)" }}>
                <th style={{ textAlign: "left", padding: 8 }}>规则</th>
                <th style={{ textAlign: "right", padding: 8 }}>触发次数</th>
              </tr>
            </thead>
            <tbody>
              {topRules.map(({ rule, count }) => (
                <tr key={rule!.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: 8 }}>{rule!.name}</td>
                  <td style={{ padding: 8, textAlign: "right" }}>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* 最热门兑换 */}
      {topRewards.length > 0 && (
        <>
          <h4 style={{ marginBottom: 8 }}>最热门兑换</h4>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--color-border)" }}>
                <th style={{ textAlign: "left", padding: 8 }}>商品</th>
                <th style={{ textAlign: "right", padding: 8 }}>兑换次数</th>
              </tr>
            </thead>
            <tbody>
              {topRewards.map(([name, count]) => (
                <tr key={name} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: 8 }}>{name}</td>
                  <td style={{ padding: 8, textAlign: "right" }}>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, color, small }: { label: string; value: string; icon: string; color?: string; small?: boolean }) {
  return (
    <div style={{
      padding: small ? 10 : 14,
      border: "1px solid var(--color-border)",
      borderRadius: 6,
      background: "var(--color-surface)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: color ?? "var(--color-text)" }}>
        <span style={{ fontSize: small ? 16 : 20 }}>{icon}</span>
        <span style={{ fontSize: small ? 18 : 24, fontWeight: 700 }}>{value}</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>{label}</div>
    </div>
  );
}