import type { EncounterRecord } from "../encounter.repository";
import { regionLabel } from "../../../components/bodymap/regions";
import { formatDate, vasSeverity } from "../../../lib/format";
import { useDiagnosisByEncounterMap } from "../../diagnosis/useDiagnosis";

interface EncounterTableProps {
  encounters: readonly EncounterRecord[];
  onExam?: (encounterId: string) => void;
  activeExamId?: string;
  activeDiagnosisId?: string;
  onCloseEncounter?: (encounterId: string) => void;
  onOpenDiagnosis?: (encounterId: string) => void;
}

export function EncounterTable({ encounters, onExam, activeExamId, activeDiagnosisId, onCloseEncounter, onOpenDiagnosis }: EncounterTableProps) {
  const hasActions = Boolean(onExam || onCloseEncounter || onOpenDiagnosis);
  const diagnosisMap = useDiagnosisByEncounterMap();

  return (
    <table className="table">
      <thead>
        <tr>
          <th scope="col">日期</th>
          <th scope="col">类型</th>
          <th scope="col">状态</th>
          <th scope="col">定位</th>
          <th scope="col">性质</th>
          <th scope="col">VAS</th>
          <th scope="col">病程</th>
          <th scope="col">诊断</th>
          {hasActions && <th scope="col" style={{ width: 120 }}>操作</th>}
        </tr>
      </thead>
      <tbody>
        {encounters.length === 0 ? (
          <tr><td colSpan={hasActions ? 9 : 8} className="empty">暂无就诊记录。</td></tr>
        ) : (
          encounters.map((e) => {
            const dx = diagnosisMap.get(e.id);
            const isActiveExam = activeExamId === e.id;
            const isActiveDiagnosis = activeDiagnosisId === e.id;
            const rowStyle: React.CSSProperties = {};
            if (isActiveExam) {
              rowStyle.borderLeft = "4px solid var(--color-accent)";
              rowStyle.background = "var(--color-accent-weak, #e4f0f7)";
            } else if (isActiveDiagnosis) {
              rowStyle.borderLeft = "4px solid var(--color-caution, #f59e0b)";
              rowStyle.background = "var(--color-caution-weak, #fef8ed)";
            }
            return (
              <tr key={e.id} style={rowStyle}>
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
                <td>
                  {dx ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: "var(--text-xs)" }}>
                      <span className="badge badge--normal">✓ 已诊断</span>
                      {dx.clinicalDiagnoses.length > 0 && (
                        <span style={{ color: "var(--color-text-muted)", fontSize: 11 }}>
                          {(() => {
                            const primary = dx.clinicalDiagnoses.find(d => d.isPrimary);
                            const txt = primary ? primary.code + " " + primary.name
                              : dx.clinicalDiagnoses[0].code + " " + dx.clinicalDiagnoses[0].name;
                            return txt.length > 22 ? txt.slice(0, 22) + "…" : txt;
                          })()}
                        </span>
                      )}
                      {!dx.clinicalDiagnoses.length && (
                        <span style={{ color: "var(--color-text-muted)", fontSize: 11 }}>
                          {dx.levels.slice(0, 2).join(" · ")}{dx.levels.length > 2 ? "…" : ""}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="badge badge--caution">未诊断</span>
                  )}
                </td>
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
                      {onOpenDiagnosis && (
                        <button className="btn btn--ghost"
                          style={{ padding: "2px 6px", fontSize: "var(--text-xs)" }}
                          onClick={() => onOpenDiagnosis(e.id)}
                          title={dx ? "查看/编辑诊断" : "添加诊断"}>
                          {dx ? "诊断" : "+ 诊断"}
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
                      {e.status === "已结束" && !dx && (
                        <span className="badge badge--caution" style={{ fontSize: "var(--text-xs)" }}>已存档</span>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}