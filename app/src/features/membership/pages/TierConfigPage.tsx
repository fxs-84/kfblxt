/**
 * 等级配置页 — 编辑门槛/倍数/折扣
 */
import { useState, useEffect, useMemo } from "react";
import { findAllTiers, updateTier } from "../rule.repository";
import type { TierConfig } from "../models";

export function TierConfigPage() {
  const [tiers, setTiers] = useState<TierConfig[]>([]);

  useEffect(() => {
    void findAllTiers().then(setTiers);
  }, []);

  const save = async (t: TierConfig) => {
    await updateTier(t.tier, t);
    setTiers(await findAllTiers());
  };

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginTop: 0 }}>等级配置</h2>
      <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
        等级按累计消费金额自动升级。倍数影响所有"award_fixed"和"award_ratio"动作。
      </p>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", marginTop: 16 }}>
        {useMemo(() => [...tiers].sort((a, b) => a.minTotalSpent - b.minTotalSpent), [tiers]).map(t => (
          <TierCard key={t.tier} tier={t} onSave={save} />
        ))}
      </div>
    </div>
  );
}

function TierCard({ tier, onSave }: { tier: TierConfig; onSave: (t: TierConfig) => Promise<void> }) {
  const [edit, setEdit] = useState(tier);
  useEffect(() => { setEdit(tier); }, [tier]);

  return (
    <div style={{
      padding: 16,
      border: `2px solid ${tier.color}`,
      borderRadius: 8,
      background: `linear-gradient(135deg, ${tier.color}15, transparent)`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 28 }}>{tier.icon}</span>
        <input
          value={edit.name}
          onChange={e => setEdit({ ...edit, name: e.target.value })}
          style={{ fontSize: 16, fontWeight: 700, border: "none", background: "transparent", flex: 1, fontFamily: "inherit" }}
        />
        <select
          value={edit.icon}
          onChange={e => setEdit({ ...edit, icon: e.target.value })}
          style={{ padding: 4, fontSize: 14 }}
        >
          {["👤", "🥈", "🥇", "💎", "⭐", "🌟", "👑", "🏆"].map(i => <option key={i} value={i}>{i}</option>)}
        </select>
      </div>

      <Field label="升级门槛(累计消费,元)">
        <input
          type="number"
          value={edit.minTotalSpent}
          onChange={e => setEdit({ ...edit, minTotalSpent: parseFloat(e.target.value) || 0 })}
          style={inputStyle}
        />
      </Field>

      <Field label="积分倍数 (1.0 = 原样)">
        <input
          type="number" step="0.1"
          value={edit.pointMultiplier}
          onChange={e => setEdit({ ...edit, pointMultiplier: parseFloat(e.target.value) || 1 })}
          style={inputStyle}
        />
      </Field>

      <Field label="兑换折扣 (1.0=原价,0.9=9折)">
        <input
          type="number" step="0.05" min="0" max="1"
          value={edit.discountOnRedeem}
          onChange={e => setEdit({ ...edit, discountOnRedeem: parseFloat(e.target.value) || 1 })}
          style={inputStyle}
        />
      </Field>

      <Field label="主题色">
        <input
          type="color"
          value={edit.color}
          onChange={e => setEdit({ ...edit, color: e.target.value })}
          style={{ width: 60, height: 32, border: "1px solid var(--color-border)", borderRadius: 4 }}
        />
      </Field>

      <button
        type="button"
        onClick={() => onSave(edit)}
        disabled={JSON.stringify(edit) === JSON.stringify(tier)}
        style={{
          width: "100%", marginTop: 12, padding: "6px 14px",
          background: "var(--color-accent)", color: "white",
          border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 600, fontSize: 13,
          opacity: JSON.stringify(edit) === JSON.stringify(tier) ? 0.4 : 1,
        }}
      >保存</button>
    </div>
  );
}

const inputStyle: React.CSSProperties = { width: "100%", padding: "6px 8px", fontSize: 13, border: "1px solid var(--color-border)", borderRadius: 4, fontFamily: "inherit" };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 2, color: "var(--color-text-muted)" }}>{label}</label>
      {children}
    </div>
  );
}