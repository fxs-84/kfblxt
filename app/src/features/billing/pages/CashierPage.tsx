import { useState, useMemo } from "react";
import { usePatients } from "../../patients/usePatients";
import { BillingPanel } from "../BillingPanel";

export function CashierPage() {
  const { data: patients = [] } = usePatients();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return patients.slice(0, 20);
    const q = search.toLowerCase();
    return patients.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.phone?.toLowerCase().includes(q) ||
        p.medicalRecordNo?.toLowerCase().includes(q),
    );
  }, [patients, search]);

  const selected = patients.find((p) => p.id === selectedId);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 800, marginBottom: 4 }}>充值 / 消费</h1>
      <p style={{ color: "var(--color-text-muted)", marginBottom: 24 }}>查询客户 → 查看余额与历史 → 充值或扣费</p>

      {/* 客户搜索 */}
      <div className="card" style={{ padding: "var(--space-4)", marginBottom: "var(--space-4)" }}>
        <div className="field" style={{ margin: 0 }}>
          <label style={{ fontWeight: 600 }}>搜索客户</label>
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelectedId(null); }}
            placeholder="输入姓名、手机号或病历号…"
            style={{ width: "100%", padding: "var(--space-2)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", font: "inherit", fontSize: "var(--text-base)" }}
            autoFocus
          />
        </div>
        {!selectedId && filtered.length > 0 && (
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                className="btn btn--ghost"
                style={{ fontSize: "var(--text-sm)" }}
                onClick={() => { setSelectedId(p.id); setSearch(p.name); }}
              >
                {p.name} · {p.medicalRecordNo}
                {p.phone ? ` · ${p.phone}` : ""}
              </button>
            ))}
          </div>
        )}
        {!selectedId && search.trim() && filtered.length === 0 && (
          <div style={{ marginTop: 8, color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>未找到匹配客户</div>
        )}
      </div>

      {/* 选中客户 → 完整 BillingPanel(余额/消费记录/充值等) */}
      {selected && (
        <div>
          <div style={{ marginBottom: 8 }}>
            <strong style={{ fontSize: "var(--text-lg)" }}>{selected.name}</strong>
            <span style={{ marginLeft: 12, color: "var(--color-text-muted)" }}>{selected.medicalRecordNo}</span>
            {selected.phone && <span style={{ marginLeft: 12, color: "var(--color-text-muted)" }}>{selected.phone}</span>}
          </div>
          <BillingPanel patientId={selected.id} />
        </div>
      )}
    </div>
  );
}
