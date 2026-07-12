import { useEncounterAssessments } from "../useAssessments";
import { formatDate } from "../../../lib/format";
import type { PainAssessmentRecordRow } from "../assessment.repository";
import { CSI_SEVERITY_LABELS } from "../scales/csi";
import { SLANSS_THRESHOLD } from "../scales/slanss";

interface Props {
  patientId: string;
  encounterId: string;
}

/**
 * 疼痛评估历史列表 — 展示某客户/某次就诊已保存的 CSI + S-LANSS 记录。
 * 治疗师完成评估后,可在此查阅历史打分。
 */
export function PainAssessmentList({ patientId, encounterId }: Props) {
  const { data: records } = useEncounterAssessments(encounterId);
  const list: PainAssessmentRecordRow[] = (records ?? []).filter((r) => r.type === "pain_assessment");

  if (list.length === 0) {
    return (
      <div style={{ padding: "var(--space-3)", fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
        尚无疼痛评估记录。
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      {list.map((r) => (
        <div
          key={r.id}
          style={{
            padding: "var(--space-3) var(--space-4)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            background: "var(--color-surface)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <b style={{ fontSize: "var(--text-sm)" }}>📋 疼痛评估 · {formatDate(r.createdAt)}</b>
            <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
              记录人:{r.createdBy ?? "系统"}
            </span>
          </div>
          <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap", fontSize: "var(--text-sm)" }}>
            <span>
              CSI:<b style={{ color: r.csi.severity === "extreme" ? "var(--color-abnormal)" : r.csi.severity === "severe" ? "var(--color-abnormal)" : r.csi.severity === "moderate" ? "#c45a00" : "var(--color-normal)" }}> {r.csi.total}</b>/100
              <span className={`brain-severity brain-severity--${r.csi.severity === "extreme" ? "severe" : r.csi.severity}`} style={{ marginLeft: 6 }}>
                {CSI_SEVERITY_LABELS[r.csi.severity]}
              </span>
            </span>
            <span>
              S-LANSS:<b style={{ color: r.slanss.positive ? "var(--color-abnormal)" : "var(--color-normal)" }}> {r.slanss.total}</b>/24
              {r.slanss.positive
                ? <span className="brain-severity brain-severity--severe" style={{ marginLeft: 6 }}>⚠ 阳性(≥{SLANSS_THRESHOLD})</span>
                : <span className="brain-severity brain-severity--normal" style={{ marginLeft: 6 }}>阴性</span>}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}