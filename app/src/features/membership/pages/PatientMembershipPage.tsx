/**
 * 患者会员卡页 — 治疗师查看 + 手动调整积分
 */
import { useState } from "react";
import { usePatientMembership, usePointsLogs, useTiers, useAdjustPoints } from "../hooks/useMembership";

interface Props {
  patientId: string;
}

export function PatientMembershipPage({ patientId }: Props) {
  const [m, reloadM] = usePatientMembership(patientId);
  const [logs, reloadLogs] = usePointsLogs(patientId, 30);
  const [tiers] = useTiers();
  const adjustPoints = useAdjustPoints();
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  if (!m) return <div style={{ padding: 24 }}>加载中...</div>;
  const tier = tiers.find(t => t.tier === m.tier);

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      {/* 等级卡 */}
      <div style={{
        padding: 20,
        borderRadius: 12,
        background: `linear-gradient(135deg, ${tier?.color ?? "#9CA3AF"}22, transparent)`,
        border: `2px solid ${tier?.color ?? "#9CA3AF"}`,
        marginBottom: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: 32 }}>{tier?.icon ?? "👤"}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{tier?.name ?? m.tier}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>积分倍数 ×{tier?.pointMultiplier ?? 1}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 24 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>当前积分</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{m.points.toLocaleString()}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>累计获得</div>
            <div style={{ fontSize: 18 }}>{m.totalEarned.toLocaleString()}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>累计消费</div>
            <div style={{ fontSize: 18 }}>¥{(m.totalSpent / 100).toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* 操作栏 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button type="button" onClick={() => setShowAdjust(v => !v)} style={{
          padding: "6px 14px", fontSize: 13, fontWeight: 600,
          background: "var(--color-accent)", color: "white",
          border: "none", borderRadius: 4, cursor: "pointer",
        }}>调整积分</button>
      </div>

      {showAdjust && (
        <div style={{
          padding: 12, border: "1px solid var(--color-border)",
          borderRadius: 6, marginBottom: 16,
          background: "var(--color-surface-sunken, #f5f7fa)",
        }}>
          <input
            type="number"
            value={adjustDelta}
            onChange={e => setAdjustDelta(e.target.value)}
            placeholder="积分变动(正负)"
            style={{ width: "100%", padding: 6, fontSize: 13, marginBottom: 6, border: "1px solid var(--color-border)", borderRadius: 4 }}
          />
          <input
            value={adjustReason}
            onChange={e => setAdjustReason(e.target.value)}
            placeholder="原因(如:补偿、消费换购、退款)"
            style={{ width: "100%", padding: 6, fontSize: 13, marginBottom: 6, border: "1px solid var(--color-border)", borderRadius: 4 }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={async () => {
              const delta = parseInt(adjustDelta, 10);
              if (isNaN(delta) || !adjustReason.trim()) return;
              await adjustPoints(patientId, delta, adjustReason.trim());
              setAdjustDelta(""); setAdjustReason("");
              setShowAdjust(false);
              await reloadM();
              await reloadLogs();
            }} style={{
              padding: "6px 14px", fontSize: 13, fontWeight: 600,
              background: "var(--color-normal)", color: "white",
              border: "none", borderRadius: 4, cursor: "pointer",
            }}>确认</button>
            <button type="button" onClick={() => setShowAdjust(false)} style={{
              padding: "6px 14px", fontSize: 13,
              background: "transparent", border: "1px solid var(--color-border)",
              borderRadius: 4, cursor: "pointer",
            }}>取消</button>
          </div>
        </div>
      )}

      {/* 积分流水 */}
      <h4 style={{ margin: "16px 0 8px", fontSize: 14 }}>积分流水</h4>
      {logs.length === 0 && <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>暂无流水</p>}
      {logs.map(log => (
        <div key={log.id} style={{
          padding: "8px 12px",
          borderBottom: "1px solid var(--color-border)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{log.reason}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
              {new Date(log.createdAt).toLocaleString("zh-CN")} · {log.triggerType ?? "manual"}
            </div>
          </div>
          <div style={{
            fontSize: 14, fontWeight: 700,
            color: log.delta >= 0 ? "var(--color-normal)" : "var(--color-abnormal)",
          }}>
            {log.delta >= 0 ? "+" : ""}{log.delta}
          </div>
        </div>
      ))}
    </div>
  );
}