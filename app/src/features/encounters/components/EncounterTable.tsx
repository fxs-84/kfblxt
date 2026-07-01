import type { EncounterRecord } from "../encounter.repository";
import { regionLabel } from "../../../components/bodymap/regions";
import { formatDate, vasSeverity } from "../../../lib/format";

interface EncounterTableProps {
  encounters: readonly EncounterRecord[];
  onExam?: (encounterId: string) => void;
  activeExamId?: string;
  onCloseEncounter?: (encounterId: string) => void;
}

export function EncounterTable({ encounters, onExam, activeExamId, onCloseEncounter }: EncounterTableProps) {
  const hasActions = Boolean(onExam || onCloseEncounter);
  return (
    <table className="table">
      <thead>
        <tr>
          <th>日期</th>
          <th>类型</th>
          <th>状态</th>
          <th>定位</th>
          <th>性质</th>
          <th>VAS</th>
          <th>病程</th>
          {hasActions && <th style={{ width: 100 }}>操作</th>}
        </tr>
      </thead>
      <tbody>
        {encounters.length === 0 ? (
          <tr><td colSpan={hasActions ? 8 : 7} className="empty">暂无就诊记录。</td></tr>
        ) : (
          encounters.map((e) => (
            <tr key={e.id}>
              <td>{formatDate(e.encounterDate)}</td>
              <td>{e.visitType}</td>
              <td>
                <span className={`badge badge--${e.status === "已结束" ? "normal" : "caution"}`} style={{ fontSize: "var(--text-xs)" }}>
                  {e.status}
                </span>
              </td>
              <td>{e.chiefComplaint.regions.map((r) => regionLabel(r)).join("、")}</td>
              <td>{e.chiefComplaint.nature.slice(0, 3).join("、")}{e.chiefComplaint.nature.length > 3 ? "…" : ""}</td>
              <td><span className={`badge badge--${vasSeverity(e.chiefComplaint.vas)}`}>{e.chiefComplaint.vas}</span></td>
              <td>{e.chiefComplaint.durationText}</td>
              {hasActions && (
                <td>
                  <div style={{ display: "flex", gap: "var(--space-1)", flexWrap: "wrap" }}>
                    {onExam && (
                      <button className={`btn btn--ghost ${activeExamId === e.id ? "btn--primary" : ""}`}
                        style={{ padding: "2px 6px", fontSize: "var(--text-xs)" }}
                        onClick={() => onExam(e.id)}>
                        {activeExamId === e.id ? "收起" : "查体"}
                      </button>
                    )}
                    {onCloseEncounter && e.status !== "已结束" && (
                      <button className="btn btn--ghost"
                        style={{ padding: "2px 6px", fontSize: "var(--text-xs)", color: "var(--color-normal)", borderColor: "var(--color-normal)" }}
                        onClick={() => onCloseEncounter(e.id)}
                        title="完成查体+诊断+治疗后,关闭本次就诊">
                        结束
                      </button>
                    )}
                    {e.status === "已结束" && (
                      <span className="badge badge--normal" style={{ fontSize: "var(--text-xs)" }}>已存档</span>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
