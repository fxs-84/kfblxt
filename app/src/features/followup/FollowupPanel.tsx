import { useState, useMemo } from "react";
import { usePatientFollowups, useCreateFollowup, useCompleteFollowup, useNoShowFollowup } from "./useFollowup";
import { formatDate } from "../../lib/format";
import { useSession } from "../../components/auth/useSession";
import { MyFilterToggle, applyMyFilter } from "../../components/auth/MyFilterToggle";

interface FollowupPanelProps { patientId: string; encounterId?: string }

/** 距今天数=负为过期,正为还有几天 */
function dueText(due: Date): { text: string; urgent: boolean } {
  const days = Math.ceil((due.getTime() - Date.now()) / 86400000);
  if (days < 0) return { text: `已过期 ${Math.abs(days)} 天`, urgent: true };
  if (days === 0) return { text: "今天", urgent: true };
  if (days <= 3) return { text: `${days} 天内`, urgent: true };
  return { text: `${days} 天后`, urgent: false };
}

export function FollowupPanel({ patientId, encounterId }: FollowupPanelProps) {
  const { data: followups = [] } = usePatientFollowups(patientId);
  const createFollowup = useCreateFollowup();
  const completeFollowup = useCompleteFollowup();
  const noShowFollowup = useNoShowFollowup();
  const session = useSession();
  const [showForm, setShowForm] = useState(false);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);

  const filteredFollowups = useMemo(
    () => applyMyFilter(followups, onlyMine, session.userId),
    [followups, onlyMine, session.userId],
  );
  const pending = filteredFollowups.filter((f) => f.status === "待复诊");

  const handleSave = async () => {
    setSaving(true);
    await createFollowup.mutateAsync({ patientId, dueDate: new Date(dueDate), note: note.trim() || "复诊" });
    setShowForm(false); setNote(""); setSaving(false);
  };

  return (
    <div className="card panel" style={{ marginTop: "var(--space-4)" }}>
      <div className="panel__head">
        <div>
          <h3 className="panel__title">复诊提醒</h3>
          {pending.length > 0 && (
            <span className={`badge badge--${pending.some((f) => dueText(f.dueDate).urgent) ? "abnormal" : "caution"}`}
              style={{ marginLeft: "var(--space-2)" }}>
              {pending.length} 条待复诊
            </span>
          )}
        </div>
        {!showForm && (
          <button className="btn btn--primary" style={{ fontSize: "var(--text-xs)" }}
            onClick={() => setShowForm(true)}>+ 设置复诊</button>
        )}
      </div>

      {showForm && (
        <div style={{ padding: "0 var(--space-5) var(--space-3)", borderBottom: "1px solid var(--color-border)" }}>
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              style={{ padding: "2px 6px", border: "1px solid var(--color-border)", borderRadius: 4, fontSize: "var(--text-xs)" }} />
            <input placeholder="备注" value={note} onChange={(e) => setNote(e.target.value)}
              style={{ flex: 1, minWidth: 150, padding: "2px 6px", border: "1px solid var(--color-border)", borderRadius: 4, fontSize: "var(--text-xs)" }} />
            <button className="btn btn--primary" style={{ fontSize: "var(--text-xs)", padding: "3px 12px" }}
              disabled={saving} onClick={handleSave}>{saving ? "…" : "保存"}</button>
            <button className="btn btn--ghost" style={{ fontSize: "var(--text-xs)" }} onClick={() => setShowForm(false)}>取消</button>
          </div>
        </div>
      )}

      {followups.length === 0 ? (
        <div className="empty" style={{ padding: "var(--space-6)" }}>暂无复诊安排。</div>
      ) : (
        <>
          <div style={{ padding: "var(--space-3) var(--space-5) 0", display: "flex", justifyContent: "flex-end" }}>
            <MyFilterToggle
              active={onlyMine}
              onChange={setOnlyMine}
              therapistName={session.fullName}
              totalCount={followups.length}
              filteredCount={filteredFollowups.length}
              compact
            />
          </div>
          {filteredFollowups.length === 0 ? (
            <div className="empty" style={{ padding: "var(--space-6)" }}>当前治疗师没有复诊安排</div>
          ) : (
            <table className="table">
              <thead>
                <tr><th>复诊日期</th><th>状态</th><th>备注</th><th style={{ width: 100 }}>操作</th></tr>
              </thead>
              <tbody>
                {filteredFollowups.map((f) => {
                  const { text, urgent } = f.status === "待复诊" ? dueText(f.dueDate) : { text: "", urgent: false };
                  return (
                    <tr key={f.id}>
                      <td>
                        <span style={{ fontWeight: 600 }}>{formatDate(f.dueDate)}</span>
                        {f.status === "待复诊" && (
                          <span className={`badge ${urgent ? "badge--abnormal" : "badge--caution"}`}
                            style={{ marginLeft: 6, fontSize: "10px" }}>{text}</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge badge--${f.status === "已完成" ? "normal" : f.status === "失约" ? "abnormal" : "caution"}`}>
                          {f.status}
                        </span>
                      </td>
                      <td>{f.note}</td>
                      <td>
                        {f.status === "待复诊" && encounterId && (
                          <button className="btn btn--ghost" style={{ fontSize: "10px", padding: "1px 6px", color: "var(--color-normal)" }}
                            onClick={() => completeFollowup.mutate({ id: f.id, encounterId })} title="关联当前就诊">
                            ✓完成
                          </button>
                        )}
                        {f.status === "待复诊" && (
                          <button className="btn btn--ghost" style={{ fontSize: "10px", padding: "1px 6px", color: "var(--color-abnormal)", marginLeft: 4 }}
                            onClick={() => noShowFollowup.mutate(f.id)}>失约</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
