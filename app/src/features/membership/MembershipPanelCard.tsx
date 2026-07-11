/**
 * 患者详情页的"会员积分"入口卡片 — 极简版,只显示当前积分 + 等级 + 两个跳转按钮。
 * 不复制 PatientMembershipPage 全部功能(等级卡 + 积分流水 + 手动调整),
 * 治疗师想深入管理点"查看明细"跳 /patients/:id/membership。
 *
 * 设计原则:
 *   - 一屏看完积分状态
 *   - 两个跳转入口:"查看明细"(会员管理) + "兑换商品"(ShopPage)
 *   - 数据加载失败/患者无会员记录时,不报错,只显示"未开通"
 */
import { Link } from "react-router-dom";
import { usePatientMembership, useTiers } from "./hooks/useMembership";

interface Props {
  patientId: string;
}

export function MembershipPanelCard({ patientId }: Props) {
  const [m] = usePatientMembership(patientId);
  const [tiers] = useTiers();

  if (!m) {
    return (
      <div className="card panel" data-testid="membership-card">
        <div className="panel__head">
          <h3 className="panel__title">🎁 会员积分</h3>
        </div>
        <div className="empty">该患者尚未开通会员</div>
      </div>
    );
  }

  const tier = tiers.find(t => t.tier === m.tier);
  const tierName = tier?.name ?? m.tier;
  const tierIcon = tier?.icon ?? "👤";

  return (
    <div className="card panel" data-testid="membership-card">
      <div className="panel__head">
        <h3 className="panel__title">🎁 会员积分</h3>
        <span className="panel__hint">{tierIcon} {tierName} · ×{tier?.pointMultiplier ?? 1}</span>
      </div>
      <div className="stat-row" style={{ marginBottom: 12 }}>
        <div className="stat">
          <span className="stat__value" data-testid="points-value">{m.points.toLocaleString()}</span>
          <span className="stat__label">当前积分</span>
        </div>
        <div className="stat">
          <span className="stat__value">{m.totalEarned.toLocaleString()}</span>
          <span className="stat__label">累计获得</span>
        </div>
        <div className="stat">
          <span className="stat__value">¥{m.totalSpent.toLocaleString()}</span>
          <span className="stat__label">累计消费</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Link
          to={`/patients/${patientId}/membership`}
          className="btn btn--ghost"
          data-testid="open-membership-detail"
          style={{ flex: 1, textAlign: "center", textDecoration: "none" }}
        >
          📊 查看明细
        </Link>
        <Link
          to={`/membership/shop/${patientId}`}
          className="btn btn--primary"
          data-testid="open-shop"
          style={{ flex: 1, textAlign: "center", textDecoration: "none" }}
        >
          🎁 兑换商品
        </Link>
      </div>
    </div>
  );
}