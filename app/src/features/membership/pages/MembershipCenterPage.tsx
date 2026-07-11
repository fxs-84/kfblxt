/**
 * 会员中心 — 治疗师操作台
 * 3 块:
 *   1. 顶部 4 个统计卡片(会员数/总积分/待审核订单/本月兑换)
 *   2. 会员列表(可按患者名/ID 搜,每行"查积分""发起兑换"快捷按钮)
 *   3. 最近兑换订单(状态 + 快捷审核入口)
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  findAllMemberships,
  findAllLogs,
  findAllRedemptions,
  findAllTiers,
  findAllRewards,
  markMembershipsOrphanedByPatient,
  markLogsOrphanedByPatient,
  markRedemptionsOrphanedByPatient,
} from "../rule.repository";
import { usePatients } from "../../patients/usePatients";
import { useSession } from "../../../components/auth/useSession";
import { can } from "../../../lib/rbac";
import type {
  PatientMembership,
  PointsLog,
  Redemption,
  TierConfig,
  RewardProduct,
} from "../models";
import { REDEMPTION_STATUS_LABEL } from "../models";

interface MemberRow {
  membership: PatientMembership;
  patientName: string;
}

export function MembershipCenterPage() {
  const [members, setMembers] = useState<PatientMembership[]>([]);
  const [logs, setLogs] = useState<PointsLog[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [tiers, setTiers] = useState<TierConfig[]>([]);
  const [rewards, setRewards] = useState<RewardProduct[]>([]);
  const { data: patients = [] } = usePatients();
  const session = useSession();
  const canDeleteMembership = session ? can(session.role, "membership:delete") : false;
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [deletingPatientId, setDeletingPatientId] = useState<string | null>(null);

  const reload = useMemo(
    () => async () => {
      setLoading(true);
      const [m, l, r, t, rw] = await Promise.all([
        findAllMemberships(),
        findAllLogs(),
        findAllRedemptions(),
        findAllTiers(),
        findAllRewards(),
      ]);
      setMembers(m);
      setLogs(l);
      setRedemptions(r);
      setTiers(t);
      setRewards(rw);
      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  /**
   * 删除某患者的会员资格 — 软删 membership + 软删该 patient 的流水/兑换;
   * localStorage 数据保留(deletedAt 时间戳)作审计/计费证据。
   * 仅 admin 可见入口;点击 → window.confirm → cascade。
   */
  const handleDeleteMembership = async (patientId: string, patientName: string) => {
    if (deletingPatientId) return;
    const ok = window.confirm(
      `确定删除会员 ${patientName}?\n该患者的会员档案、积分流水与兑换订单将不再显示,但后台数据保留以备审计。`,
    );
    if (!ok) return;
    setDeletingPatientId(patientId);
    try {
      const [mCount, lCount, rCount] = await Promise.all([
        markMembershipsOrphanedByPatient(patientId),
        markLogsOrphanedByPatient(patientId),
        markRedemptionsOrphanedByPatient(patientId),
      ]);
      // eslint-disable-next-line no-console
      console.log(`[deleteMembership] ${patientId} cascade: memberships=${mCount}, logs=${lCount}, redemptions=${rCount}`);
      await reload();
    } finally {
      setDeletingPatientId(null);
    }
  };

  const patientMap = useMemo(
    () => new Map(patients.map(p => [p.id, p.name] as const)),
    [patients],
  );

  const rows: MemberRow[] = useMemo(
    () => members.map(m => ({
      membership: m,
      patientName: patientMap.get(m.patientId) ?? `(${m.patientId.slice(0, 6)}…)`,
    })),
    [members, patientMap],
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.patientName.toLowerCase().includes(q) ||
      r.membership.patientId.toLowerCase().includes(q)
    );
  }, [rows, search]);

  // 统计
  const totalPoints = members.reduce((s, m) => s + m.points, 0);
  const pendingRedemptions = redemptions.filter(r => r.status === "pending");
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthRedemptions = redemptions.filter(r => r.createdAt.startsWith(thisMonth));

  // 会员等级分布
  const tierDistribution = useMemo(() => {
    const dist = new Map<string, number>();
    for (const m of members) {
      dist.set(m.tier, (dist.get(m.tier) ?? 0) + 1);
    }
    return tiers.map(t => ({ tier: t, count: dist.get(t.tier) ?? 0 }));
  }, [members, tiers]);

  // 最近 10 条兑换
  const recentRedemptions = useMemo(
    () => [...redemptions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10),
    [redemptions],
  );

  const rewardsById = useMemo(
    () => new Map(rewards.map(r => [r.id, r] as const)),
    [rewards],
  );

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>🎁 会员中心</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <Link to="/membership/rules" className="btn btn--ghost">⚙️ 积分规则</Link>
          <Link to="/membership/products" className="btn btn--ghost">📦 商品管理</Link>
          <Link to="/membership/review" className="btn btn--ghost">📋 兑换审核</Link>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="overview-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 16 }}>
        <div className="card panel" data-testid="stat-members">
          <div className="panel__head"><h3 className="panel__title">👥 会员总数</h3></div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{members.length}</div>
        </div>
        <div className="card panel" data-testid="stat-points">
          <div className="panel__head"><h3 className="panel__title">💰 流通积分</h3></div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{totalPoints.toLocaleString()}</div>
        </div>
        <div className="card panel" data-testid="stat-pending">
          <div className="panel__head"><h3 className="panel__title">⏳ 待审核兑换</h3></div>
          <div style={{ fontSize: 32, fontWeight: 700, color: pendingRedemptions.length > 0 ? "#f59e0b" : undefined }}>
            {pendingRedemptions.length}
          </div>
        </div>
        <div className="card panel" data-testid="stat-month">
          <div className="panel__head"><h3 className="panel__title">📅 本月兑换</h3></div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{monthRedemptions.length}</div>
        </div>
      </div>

      {/* 等级分布 */}
      <div className="card panel" style={{ marginBottom: 16 }}>
        <div className="panel__head"><h3 className="panel__title">📊 等级分布</h3></div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {tierDistribution.map(({ tier, count }) => (
            <div key={tier.tier} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 20 }}>{tier.icon}</span>
              <span style={{ fontWeight: 600 }}>{tier.name}</span>
              <span style={{ color: "var(--color-text-muted)" }}>×{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 会员列表 */}
      <div className="card panel" style={{ marginBottom: 16 }} data-testid="member-list">
        <div className="panel__head">
          <h3 className="panel__title">👥 会员列表</h3>
          <span className="panel__hint">{filteredRows.length} / {rows.length}</span>
        </div>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜患者名或 ID…"
          style={{
            width: "100%", padding: "8px 10px", fontSize: 13,
            border: "1px solid var(--color-border)", borderRadius: 4, marginBottom: 12,
          }}
          data-testid="member-search"
        />
        {loading ? <div className="empty">加载中…</div> :
         filteredRows.length === 0 ? <div className="empty">{rows.length === 0 ? "暂无会员" : "没有匹配结果"}</div> :
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
              <th style={{ padding: "8px 6px" }}>患者</th>
              <th style={{ padding: "8px 6px" }}>等级</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>当前积分</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>累计获得</th>
              <th style={{ padding: "8px 6px" }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map(({ membership: m, patientName }) => {
              const tier = tiers.find(t => t.tier === m.tier);
              return (
                <tr key={m.patientId} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "8px 6px", fontWeight: 600 }}>{patientName}</td>
                  <td style={{ padding: "8px 6px" }}>{tier?.icon} {tier?.name ?? m.tier}</td>
                  <td style={{ padding: "8px 6px", textAlign: "right", fontWeight: 700, color: "var(--color-accent)" }}>
                    {m.points.toLocaleString()}
                  </td>
                  <td style={{ padding: "8px 6px", textAlign: "right", color: "var(--color-text-muted)" }}>
                    {m.totalEarned.toLocaleString()}
                  </td>
                  <td style={{ padding: "8px 6px" }}>
                    <Link
                      to={`/membership/points/${m.patientId}`}
                      className="btn btn--ghost"
                      style={{ fontSize: 11, padding: "4px 8px", marginRight: 4 }}
                      data-testid="open-points-history"
                    >
                      📊 查积分
                    </Link>
                    <Link
                      to={`/membership/redeem/${m.patientId}`}
                      className="btn btn--primary"
                      style={{ fontSize: 11, padding: "4px 8px", textDecoration: "none" }}
                      data-testid="open-redeem"
                    >
                      🎁 发起兑换
                    </Link>
                    {canDeleteMembership && (
                      <button
                        type="button"
                        onClick={() => void handleDeleteMembership(m.patientId, patientName)}
                        disabled={deletingPatientId === m.patientId}
                        className="btn btn--danger"
                        style={{ fontSize: 11, padding: "4px 8px", marginLeft: 4 }}
                        data-testid="delete-membership"
                        aria-label={`删除会员 ${patientName}`}
                      >
                        {deletingPatientId === m.patientId ? "删除中…" : "🗑 删除"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>}
      </div>

      {/* 最近兑换订单 */}
      <div className="card panel">
        <div className="panel__head">
          <h3 className="panel__title">📋 最近兑换订单</h3>
          <Link to="/membership/review" style={{ fontSize: 12 }}>查看全部 →</Link>
        </div>
        {recentRedemptions.length === 0 ? <div className="empty">暂无兑换记录</div> :
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
              <th style={{ padding: "6px" }}>时间</th>
              <th style={{ padding: "6px" }}>患者</th>
              <th style={{ padding: "6px" }}>商品</th>
              <th style={{ padding: "6px", textAlign: "right" }}>积分</th>
              <th style={{ padding: "6px" }}>状态</th>
            </tr>
          </thead>
          <tbody>
            {recentRedemptions.map(r => (
              <tr key={r.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                <td style={{ padding: "6px", color: "var(--color-text-muted)" }}>
                  {new Date(r.createdAt).toLocaleDateString()}
                </td>
                <td style={{ padding: "6px" }}>{patientMap.get(r.patientId) ?? r.patientId.slice(0, 6)}</td>
                <td style={{ padding: "6px" }}>{r.rewardName}</td>
                <td style={{ padding: "6px", textAlign: "right" }}>{r.pointsCost.toLocaleString()}</td>
                <td style={{ padding: "6px" }}>
                  <span style={{
                    padding: "2px 8px", borderRadius: 4, fontSize: 11,
                    background: r.status === "pending" ? "#fef3c7" :
                                r.status === "fulfilled" ? "#d1fae5" :
                                r.status === "cancelled" ? "#fee2e2" : "#e5e7eb",
                    color: r.status === "pending" ? "#92400e" :
                           r.status === "fulfilled" ? "#065f46" :
                           r.status === "cancelled" ? "#991b1b" : "#374151",
                  }}>
                    {REDEMPTION_STATUS_LABEL[r.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>}
      </div>
    </div>
  );
}