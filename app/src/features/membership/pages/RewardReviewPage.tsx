/**
 * 兑换审核页 — 治疗师审核待兑换订单
 */
import { useEffect, useMemo, useState } from "react";
import {
  findAllRedemptions,
  findAllMemberships,
} from "../rule.repository";
import { fulfillRedemption, cancelRedemption } from "../redemption.service";
import { useSession } from "../../../components/auth/useSession";
import type { Redemption, PatientMembership } from "../models";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";

export function RewardReviewPage() {
  const [orders, setOrders] = useState<Redemption[]>([]);
  const [members, setMembers] = useState<PatientMembership[]>([]);
  const [filter, setFilter] = useState<"pending" | "all" | "fulfilled" | "cancelled">("pending");
  const [pendingCancel, setPendingCancel] = useState<string | null>(null);
  const session = useSession();

  const reload = async () => {
    setOrders(await findAllRedemptions());
    setMembers(await findAllMemberships());
  };

  useEffect(() => { void reload(); }, []);

  const filtered = useMemo(() => filter === "all" ? orders : orders.filter(o => o.status === filter), [filter, orders]);

  const handleFulfill = async (id: string) => {
    await fulfillRedemption(id, session?.userId ?? "system");
    await reload();
  };
  const handleCancel = (id: string) => setPendingCancel(id);
  const confirmCancel = async () => {
    if (!pendingCancel) return;
    const id = pendingCancel;
    setPendingCancel(null);
    await cancelRedemption(id, session?.userId ?? "system");
    await reload();
  };

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginTop: 0 }}>兑换审核</h2>

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {(["pending", "fulfilled", "cancelled", "all"] as const).map(f => (
          <button key={f} type="button" onClick={() => setFilter(f)} style={{
            padding: "4px 12px", fontSize: 12,
            background: filter === f ? "var(--color-accent)" : "transparent",
            color: filter === f ? "white" : "var(--color-text)",
            border: "1px solid var(--color-border)", borderRadius: 14, cursor: "pointer",
          }}>{labelOf(f)} ({countOf(orders, f)})</button>
        ))}
      </div>

      {filtered.length === 0 && <p style={{ color: "var(--color-text-muted)" }}>暂无订单</p>}

      {useMemo(() => [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [filtered]).map(o => {
        const m = members.find(x => x.patientId === o.patientId);
        return (
          <div key={o.id} style={{
            padding: 12,
            marginBottom: 8,
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            background: o.status === "pending" ? "var(--color-caution-weak, #fef8ed)" : "var(--color-surface)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{o.rewardName}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  客户: {m?.patientId.slice(0, 8) ?? o.patientId} · {o.pointsCost} 积分
                </div>
                <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
                  {new Date(o.createdAt).toLocaleString("zh-CN")}
                  {o.fulfilledAt && <> · 履约 {new Date(o.fulfilledAt).toLocaleString("zh-CN")}</>}
                  {o.cancelledAt && <> · 取消 {new Date(o.cancelledAt).toLocaleString("zh-CN")}</>}
                </div>
                {o.notes && <div style={{ fontSize: 11, marginTop: 4 }}>备注: {o.notes}</div>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                <span style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 3,
                  background: statusBg(o.status), color: "white", fontWeight: 600,
                }}>{statusLabel(o.status)}</span>
                {o.status === "pending" && (
                  <div style={{ display: "flex", gap: 4 }}>
                    <button type="button" onClick={() => handleFulfill(o.id)} style={{
                      padding: "4px 10px", fontSize: 11, fontWeight: 600,
                      background: "var(--color-normal)", color: "white",
                      border: "none", borderRadius: 4, cursor: "pointer",
                    }}>✓ 履约</button>
                    <button type="button" onClick={() => handleCancel(o.id)} style={{
                      padding: "4px 10px", fontSize: 11,
                      background: "transparent", border: "1px solid var(--color-abnormal)",
                      color: "var(--color-abnormal)", borderRadius: 4, cursor: "pointer",
                    }}>取消</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <ConfirmDialog
        open={pendingCancel !== null}
        title="取消兑换"
        message="确定取消此兑换?积分将退还给客户。"
        confirmLabel="取消兑换"
        danger
        onClose={() => setPendingCancel(null)}
        onConfirm={confirmCancel}
      />
    </div>
  );
}

function labelOf(f: string): string {
  return f === "pending" ? "待审核" : f === "fulfilled" ? "已履约" : f === "cancelled" ? "已取消" : "全部";
}
function countOf(orders: Redemption[], f: string): number {
  return f === "all" ? orders.length : orders.filter(o => o.status === f).length;
}
function statusBg(s: Redemption["status"]): string {
  return s === "pending" ? "var(--color-caution, #f59e0b)" : s === "fulfilled" ? "var(--color-normal)" : "var(--color-abnormal)";
}
function statusLabel(s: Redemption["status"]): string {
  return s === "pending" ? "待审核" : s === "fulfilled" ? "已履约" : s === "cancelled" ? "已取消" : "已过期";
}