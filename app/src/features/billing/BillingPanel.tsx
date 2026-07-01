import { useState } from "react";
import { useBilling, useCreateBilling, useDeleteBilling } from "./useBilling";
import { BILLING_TYPES, type BillingType } from "./billing.types";
import { formatDate } from "../../lib/format";

interface BillingPanelProps { patientId: string; encounterId?: string }

function fmn(n: number): string { return n.toLocaleString("zh-CN", { minimumFractionDigits: 2 }); }

export function BillingPanel({ patientId, encounterId }: BillingPanelProps) {
  const { records, balance, isLoading } = useBilling(patientId);
  const createBilling = useCreateBilling();
  const deleteBilling = useDeleteBilling();
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<BillingType>("充值");
  const [amount, setAmount] = useState("");
  const [sessions, setSessions] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { setError("请输入有效金额"); return; }
    if (!note.trim()) { setError("请输入备注"); return; }
    setError(null);
    setSaving(true);
    try {
      await createBilling.mutateAsync({
        patientId, type, amount: amt,
        sessions: sessions ? Number(sessions) : undefined,
        note: note.trim(), encounterId,
      });
      setShowForm(false); setAmount(""); setSessions(""); setNote("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <div className="card panel"><div className="empty">加载中…</div></div>;

  return (
    <div className="card panel" style={{ marginBottom: "var(--space-4)" }}>
      <div className="panel__head">
        <div>
          <h3 className="panel__title">卡次 / 消费记录</h3>
          <div className="billing-balance">
            <div className="billing-balance__item">
              <span className="billing-balance__label">余额</span>
              <span className={`billing-balance__value ${balance.balance < 0 ? "billing-balance__value--neg" : ""}`}>
                ¥{fmn(balance.balance)}
              </span>
            </div>
            <div className="billing-balance__item">
              <span className="billing-balance__label">累计充值</span>
              <span className="billing-balance__value billing-balance__value--in">¥{fmn(balance.totalRecharge)}</span>
            </div>
            <div className="billing-balance__item">
              <span className="billing-balance__label">累计消费</span>
              <span className="billing-balance__value billing-balance__value--out">¥{fmn(balance.totalSpent)}</span>
            </div>
            {balance.totalSessions > 0 && (
              <div className="billing-balance__item">
                <span className="billing-balance__label">剩余卡次</span>
                <span className="billing-balance__value">{balance.sessionBalance} / {balance.totalSessions}</span>
              </div>
            )}
          </div>
        </div>
        {!showForm && (
          <button className="btn btn--primary" style={{ fontSize: "var(--text-xs)" }} onClick={() => setShowForm(true)}>
            + 新增记录
          </button>
        )}
      </div>

      {showForm && (
        <div style={{ padding: "0 var(--space-5) var(--space-4)", borderBottom: "1px solid var(--color-border)" }}>
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
            <select className="exam-grade" value={type} onChange={(e) => setType(e.target.value as BillingType)}>
              {BILLING_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
            <input className="exam-number" style={{ width: 100 }} type="number" step="0.01" min="0"
              placeholder="金额" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <input className="exam-number" style={{ width: 80 }} type="number" min="0"
              placeholder="卡次" value={sessions} onChange={(e) => setSessions(e.target.value)} />
            <input placeholder="备注(必填)" value={note} onChange={(e) => setNote(e.target.value)}
              style={{ flex: 1, minWidth: 120, padding: "2px 6px", border: "1px solid var(--color-border)", borderRadius: 4, fontSize: "var(--text-xs)" }} />
            <button className="btn btn--primary" style={{ fontSize: "var(--text-xs)", padding: "3px 12px" }}
              disabled={saving} onClick={handleSave}>{saving ? "…" : "保存"}</button>
            <button className="btn btn--ghost" style={{ fontSize: "var(--text-xs)", padding: "3px 8px" }}
              onClick={() => setShowForm(false)}>取消</button>
          </div>
          {error && <div className="field__error" style={{ marginTop: "var(--space-2)" }}>{error}</div>}
        </div>
      )}

      {records.length === 0 ? (
        <div className="empty">暂无消费记录</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>日期</th>
              <th>类型</th>
              <th>金额</th>
              <th>卡次</th>
              <th>备注</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id}>
                <td>{formatDate(r.createdAt)}</td>
                <td>
                  <span className={`badge badge--${r.type === "充值" ? "normal" : r.type === "退费" ? "abnormal" : "caution"}`}>
                    {r.type}
                  </span>
                </td>
                <td style={{ fontWeight: 600, color: r.type === "充值" ? "var(--color-normal)" : "var(--color-abnormal)" }}>
                  {r.type === "充值" ? "+" : "-"}¥{fmn(r.amount)}
                </td>
                <td>{r.sessions ?? "—"}</td>
                <td>{r.note}</td>
                <td>
                  <button className="btn btn--ghost" style={{ padding: "0 4px", fontSize: "11px" }}
                    onClick={() => deleteBilling.mutate(r.id)} title="删除">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
