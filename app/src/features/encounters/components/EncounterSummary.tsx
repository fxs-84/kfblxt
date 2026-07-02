import type { EncounterRecord } from "../encounter.repository";
import { useExamSessions } from "../../exam/useExam";
import { useDiagnosis } from "../../diagnosis/useDiagnosis";
import { useTreatmentPlans, useProgressNotesByEncounter } from "../../treatment/useTreatment";
import { INTERVENTIONS_CATALOG } from "../../treatment/interventions-catalog";
import { ExamResultSummary } from "../../exam/components/ExamResultSummary";
import { regionLabel } from "../../../components/bodymap/regions";
import { formatDate, SEX_LABELS } from "../../../lib/format";
import type { Sex } from "../../patients/patient.schema";
import { useAttachments } from "../../attachments/useAttachments";
import { TherapistAttribution } from "../../../components/auth/TherapistAttribution";

interface EncounterSummaryProps {
  encounter: EncounterRecord;
  patientName: string;
  patientSex: Sex;
}

export function EncounterSummary({ encounter, patientName, patientSex }: EncounterSummaryProps) {
  const { data: sessions = [] } = useExamSessions(encounter.id);
  const { data: diagnosis } = useDiagnosis(encounter.id);
  const { data: plans = [] } = useTreatmentPlans(encounter.id);
  const { data: notes = [] } = useProgressNotesByEncounter(encounter.id);
  const { data: attachments = [] } = useAttachments(encounter.id);

  return (
    <div className="encounter-summary" style={{ marginBottom: "1.5rem" }}>
      <div className="encounter-summary__header card">
        <div className="panel__head" style={{ padding: "var(--space-4) var(--space-6)" }}>
          <div>
            <h3 className="panel__title">就诊摘要</h3>
            <p className="page-subtitle" style={{ margin: 0 }}>
              {patientName} · {SEX_LABELS[patientSex]} · {formatDate(encounter.encounterDate)} · {encounter.visitType}
            </p>
            <TherapistAttribution
              userId={encounter.createdBy}
              at={encounter.createdAt}
              label="操作"
            />
            {encounter.updatedBy && encounter.updatedBy !== encounter.createdBy && (
              <TherapistAttribution
                userId={encounter.updatedBy}
                at={encounter.updatedAt}
                label="最后更新"
              />
            )}
          </div>
          <span className="badge badge--normal" style={{ fontSize: "var(--text-sm)", padding: "4px 12px" }}>
            ✓ 已结束
          </span>
        </div>

        {/* 主诉 */}
        <div className="summary-section">
          <h4 className="summary-section__title">主诉</h4>
          <div className="summary-section__body">
            <p><strong>症状定位:</strong> {encounter.chiefComplaint.regions.map((r) => regionLabel(r)).join("、")}</p>
            {encounter.chiefComplaint.distributionNote && <p><strong>皮区备注:</strong> {encounter.chiefComplaint.distributionNote}</p>}
            <p><strong>症状性质:</strong> {encounter.chiefComplaint.nature.join("、")}</p>
            <p>
              <strong>VAS:</strong> <span className={`badge badge--${encounter.chiefComplaint.vas >= 7 ? "abnormal" : encounter.chiefComplaint.vas >= 4 ? "caution" : "normal"}`}>{encounter.chiefComplaint.vas}</span>
              {" "}<strong>病程:</strong> {encounter.chiefComplaint.durationText}
            </p>
          </div>
        </div>

        {/* 查体 */}
        <div className="summary-section">
          <h4 className="summary-section__title">查体 ({sessions.length} 次)</h4>
          <div className="summary-section__body">
            {sessions.length === 0 ? <p className="empty">暂无查体记录</p> : sessions.map((s) => <ExamResultSummary key={s.id} session={s} />)}
          </div>
        </div>

        {/* 定位诊断 */}
        <div className="summary-section">
          <h4 className="summary-section__title">神经定位诊断</h4>
          <div className="summary-section__body">
            {diagnosis ? (
              <div>
                <p><strong>水平:</strong> {diagnosis.levels.join("、")} · {diagnosis.side === "left" ? "左侧" : diagnosis.side === "right" ? "右侧" : diagnosis.side === "bilateral" ? "双侧" : "中线"}</p>
                {diagnosis.segments?.length ? <p><strong>节段:</strong> {diagnosis.segments.join("、")}</p> : null}
                {diagnosis.nerves?.length ? <p><strong>神经干:</strong> {diagnosis.nerves.join("、")}</p> : null}
                {diagnosis.cutaneousNerveIds?.length ? <p><strong>皮神经敏化:</strong> {diagnosis.cutaneousNerveIds.length}条</p> : null}
                <p><strong>机制:</strong> {diagnosis.mechanisms.join("、")}</p>
                {diagnosis.reasoning && <p style={{ fontStyle: "italic", borderLeft: "2px solid var(--color-accent)", paddingLeft: "var(--space-3)" }}>{diagnosis.reasoning}</p>}
              </div>
            ) : <p className="empty">暂无定位诊断</p>}
          </div>
        </div>

        {/* 治疗计划 */}
        <div className="summary-section">
          <h4 className="summary-section__title">治疗计划 ({plans.length} 个)</h4>
          <div className="summary-section__body">
            {plans.length === 0 ? <p className="empty">暂无治疗计划</p> : plans.map((plan) => (
              <div key={plan.id} className="summary-plan">
                <p><strong>{plan.phase} · {plan.frequency} · {plan.duration}</strong></p>
                <p><strong>干预:</strong> {plan.interventionIds.map((id) => INTERVENTIONS_CATALOG.find((d) => d.id === id)?.name ?? id).join("、")}</p>
                {plan.goals.length > 0 && <p><strong>目标:</strong> {plan.goals.map((g) => `${g.description}(${g.metric ?? ""})`).join("; ")}</p>}
                {plan.boundaries && <p className="plan-card__boundary">⚠ 康复界限: {plan.boundaries}</p>}
                {/* 复评 */}
                {notes.filter((n) => n.treatmentPlanId === plan.id).length > 0 && (
                  <p style={{ marginTop: 4 }}>
                    <strong>复评:</strong> {notes.filter((n) => n.treatmentPlanId === plan.id).map((n) => (
                      <span key={n.id} className={`badge badge--${n.outcome === "显效" || n.outcome === "有效" ? "normal" : n.outcome === "恶化" ? "abnormal" : "caution"}`} style={{ marginRight: 4 }}>
                        {n.node}:{n.outcome}{n.vasAfter !== undefined ? ` VAS${n.vasAfter}` : ""}
                      </span>
                    ))}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 附件 */}
        {attachments.length > 0 && (
          <div className="summary-section">
            <h4 className="summary-section__title">附件 ({attachments.length})</h4>
            <div className="summary-section__body">
              {attachments.map((a) => (
                <div key={a.id} style={{ fontSize: "var(--text-sm)", margin: "var(--space-1) 0" }}>
                  <a href={a.dataUrl} target="_blank" rel="noreferrer"
                    style={{ color: "var(--color-accent)", fontWeight: 500 }}>
                    {a.fileName}
                  </a>
                  <span style={{ color: "var(--color-text-muted)", marginLeft: "var(--space-2)" }}>
                    {a.category} {a.timeline ? `· ${a.timeline}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
