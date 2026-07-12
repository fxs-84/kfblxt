/**
 * 兑换商城 — 客户视角(治疗师代为下单)
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  findAllRewards,
  findAllTiers,
  getOrCreateMembership,
} from "../rule.repository";
import { useRedeem } from "../redemption.service";
import { REWARD_CATEGORY_LABEL, type RewardProduct, type TierConfig, type PatientMembership } from "../models";

interface Props {
  patientId?: string;
  onClose?: () => void;
}

export function ShopPage({ patientId: propPatientId, onClose }: Props) {
  const params = useParams();
  const navigate = useNavigate();
  const patientId = propPatientId ?? params.patientId ?? "";
  const handleClose = onClose ?? (() => navigate(-1));
  const [rewards, setRewards] = useState<RewardProduct[]>([]);
  const [tiers, setTiers] = useState<TierConfig[]>([]);
  const [m, setM] = useState<PatientMembership | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [msg, setMsg] = useState<string | null>(null);
  const redeem = useRedeem();

  const reload = async () => {
    setRewards(await findAllRewards());
    setTiers(await findAllTiers());
    setM(await getOrCreateMembership(patientId));
  };

  useEffect(() => { void reload(); }, [patientId]);

  const filtered = filter === "all" ? rewards : rewards.filter(r => r.category === filter);
  const tier = m ? tiers.find(t => t.tier === m.tier) : null;

  const handleRedeem = async (r: RewardProduct) => {
    setMsg(null);
    const result = await redeem(patientId, r.id);
    if (result.ok) {
      setMsg(`✅ 兑换成功: ${r.name}`);
      await reload();
    } else {
      setMsg(`❌ ${result.error}`);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>积分商城</h2>
        {onClose && <button type="button" onClick={handleClose} style={{ padding: "4px 10px", background: "transparent", border: "1px solid var(--color-border)", borderRadius: 4 }}>关闭</button>}
      </div>

      {m && (
        <div style={{
          padding: 12, marginBottom: 16,
          background: "linear-gradient(135deg, #e6f0fa, transparent)",
          borderRadius: 8, border: "1px solid var(--color-border)",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <span style={{ fontSize: 24 }}>{tier?.icon ?? "👤"}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{tier?.name ?? m.tier}</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{m.points.toLocaleString()} 积分</div>
          </div>
        </div>
      )}

      {msg && (
        <div style={{
          padding: 10, marginBottom: 12, borderRadius: 4,
          background: msg.startsWith("✅") ? "var(--color-normal-weak, #ecfdf5)" : "var(--color-abnormal-bg, #fef2f2)",
          color: msg.startsWith("✅") ? "var(--color-normal)" : "var(--color-abnormal)",
        }}>{msg}</div>
      )}

      {/* 分类筛选 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>全部</FilterChip>
        {Object.entries(REWARD_CATEGORY_LABEL).map(([k, label]) => (
          <FilterChip key={k} active={filter === k} onClick={() => setFilter(k)}>{label}</FilterChip>
        ))}
      </div>

      {/* 商品网格 */}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {filtered.filter(r => r.enabled).map(r => {
          const requiredTier = r.tierRequired ? tiers.find(t => t.tier === r.tierRequired) : null;
          const canAfford = m && m.points >= r.pointsCost;
          const meetsTier = !r.tierRequired || (m && m.tier === r.tierRequired) ||
            (m && ["regular", "silver", "gold", "diamond"].indexOf(m.tier) >= ["regular", "silver", "gold", "diamond"].indexOf(r.tierRequired));
          const disabled = !canAfford || !meetsTier;

          return (
            <div key={r.id} style={{
              padding: 12,
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              background: disabled ? "var(--color-surface-sunken, #f9fafb)" : "var(--color-surface)",
              opacity: disabled ? 0.6 : 1,
            }}>
              <div style={{ fontSize: 36, textAlign: "center", marginBottom: 6 }}>{r.imageEmoji}</div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{r.name}</div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)", minHeight: 32, marginBottom: 6 }}>{r.description}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontWeight: 700, color: "var(--color-accent)" }}>{r.pointsCost} 积分</span>
                {requiredTier && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: requiredTier.color + "22", color: requiredTier.color }}>{requiredTier.icon} {requiredTier.name}</span>}
              </div>
              {r.stock !== -1 && <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 6 }}>库存: {r.stock}</div>}
              <button
                type="button"
                onClick={() => handleRedeem(r)}
                disabled={disabled}
                style={{
                  width: "100%", padding: "6px 12px",
                  background: disabled ? "var(--color-border)" : "var(--color-accent)",
                  color: disabled ? "var(--color-text-muted)" : "white",
                  border: "none", borderRadius: 4, cursor: disabled ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600,
                }}
              >
                {!meetsTier ? `需${requiredTier?.name}` : !canAfford ? "积分不足" : "兑换"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: "4px 12px", fontSize: 12,
      background: active ? "var(--color-accent)" : "transparent",
      color: active ? "white" : "var(--color-text)",
      border: "1px solid var(--color-border)",
      borderRadius: 14, cursor: "pointer",
    }}>{children}</button>
  );
}