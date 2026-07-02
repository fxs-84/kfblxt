import { useMemo } from "react";
import { usePatientEncounters } from "../../features/encounters/useEncounters";
import { useAllExamSessions } from "../../features/exam/useExam";
import { useAllDiagnoses } from "../../features/diagnosis/useDiagnosis";
import { useAllTreatmentPlans } from "../../features/treatment/useTreatment";
import { useAllBilling } from "../../features/billing/useBilling";
import { useAllFollowups } from "../../features/followup/useFollowup";
import { getProfileById } from "../../lib/profiles";
import { formatDate } from "../../lib/format";

type OperationType =
  | "建档"
  | "就诊"
  | "查体"
  | "诊断"
  | "治疗计划"
  | "计费"
  | "复诊"
  | "更新";

interface TimelineEvent {
  id: string;
  type: OperationType;
  at: Date;
  authorId?: string;
  summary: string;
  icon: string;
}

interface OperationTimelineProps {
  patientId: string;
  patientCreatedAt?: Date;
  patientCreatedBy?: string;
}

/**
 * 患者操作时间线:聚合该患者相关的所有事件,按时间倒序。
 * 数据来源:encounters(直接),exam_sessions/diagnoses/plans(经 encounter 间接),
 * billing/followup(直接 patientId)。
 */
export function OperationTimeline({
  patientId,
  patientCreatedAt,
  patientCreatedBy,
}: OperationTimelineProps) {
  const { data: encounters = [] } = usePatientEncounters(patientId);
  const { data: examSessions = [] } = useAllExamSessions();
  const { data: diagnoses = [] } = useAllDiagnoses();
  const { data: plans = [] } = useAllTreatmentPlans();
  const { records: billing = [] } = useAllBilling();
  const { data: followups = [] } = useAllFollowups();

  const events = useMemo<TimelineEvent[]>(() => {
    const list: TimelineEvent[] = [];
    const encounterIds = new Set(encounters.map((e) => e.id));

    if (patientCreatedAt) {
      list.push({
        id: `patient-${patientId}-created`,
        type: "建档",
        at: patientCreatedAt,
        authorId: patientCreatedBy,
        summary: "创建患者档案",
        icon: "👤",
      });
    }

    for (const e of encounters) {
      list.push({
        id: `enc-${e.id}`,
        type: "就诊",
        at: e.createdAt,
        authorId: e.createdBy,
        summary: `${e.visitType} · ${e.chiefComplaint.regions.length} 个症状区 · VAS ${e.chiefComplaint.vas}`,
        icon: "📋",
      });
    }

    // 查体:按 encounterId 过滤
    for (const es of examSessions) {
      if (encounterIds.has(es.encounterId)) {
        const itemCount = Object.keys(es.results ?? {}).length;
        list.push({
          id: `exam-${es.id}`,
          type: "查体",
          at: es.createdAt,
          authorId: es.createdBy,
          summary: `查体记录 · ${itemCount} 项条目`,
          icon: "🔍",
        });
      }
    }

    // 诊断:按 encounterId 过滤
    for (const d of diagnoses) {
      if (encounterIds.has(d.encounterId)) {
        const levels = d.levels ?? [];
        list.push({
          id: `dx-${d.id}`,
          type: "诊断",
          at: d.createdAt,
          authorId: d.createdBy,
          summary: `神经定位: ${levels.length > 0 ? levels.join(", ") : "未指定"}`,
          icon: "🧠",
        });
      }
    }

    // 治疗计划:按 encounterId 过滤
    for (const p of plans) {
      if (encounterIds.has(p.encounterId)) {
        list.push({
          id: `plan-${p.id}`,
          type: "治疗计划",
          at: p.createdAt,
          authorId: p.createdBy,
          summary: `${p.phase} · ${(p.interventionIds ?? []).length} 项干预 · ${(p.goals ?? []).length} 个目标`,
          icon: "💊",
        });
      }
    }

    // 计费:按 patientId 过滤
    for (const b of billing) {
      if (b.patientId === patientId) {
        list.push({
          id: `bill-${b.id}`,
          type: "计费",
          at: b.createdAt,
          authorId: b.createdBy,
          summary: `${b.type} ¥${b.amount.toFixed(2)}${b.note ? " · " + b.note : ""}`,
          icon: "💰",
        });
      }
    }

    // 复诊:按 patientId 过滤
    for (const f of followups) {
      if (f.patientId === patientId) {
        list.push({
          id: `fu-${f.id}`,
          type: "复诊",
          at: f.createdAt,
          authorId: f.createdBy,
          summary: `复诊 · ${formatDate(f.dueDate)} · ${f.status}`,
          icon: "📅",
        });
      }
    }

    return list.sort((a, b) => b.at.getTime() - a.at.getTime());
  }, [
    patientId, patientCreatedAt, patientCreatedBy,
    encounters, examSessions, diagnoses, plans, billing, followups,
  ]);

  if (events.length === 0) {
    return (
      <div className="card panel">
        <div className="panel__head">
          <h3 className="panel__title">操作历史</h3>
        </div>
        <div className="empty">暂无操作记录</div>
      </div>
    );
  }

  return (
    <div className="card panel">
      <div className="panel__head">
        <div>
          <h3 className="panel__title">操作历史</h3>
          <p className="page-subtitle" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
            共 {events.length} 条 · 按时间倒序
          </p>
        </div>
      </div>
      <ol className="timeline">
        {events.map((ev) => {
          const author = getProfileById(ev.authorId);
          return (
            <li key={ev.id} className="timeline__item">
              <span className="timeline__dot" data-type={ev.type} aria-hidden>{ev.icon}</span>
              <div className="timeline__body">
                <div className="timeline__row">
                  <span className="timeline__type">{ev.type}</span>
                  <span className="timeline__time">{formatDate(ev.at)}</span>
                </div>
                <div className="timeline__summary">{ev.summary}</div>
                <div className="timeline__author">
                  {author ? (
                    <>由 <strong>{author.fullName}</strong> 操作</>
                  ) : (
                    <em style={{ color: "var(--color-text-muted)" }}>作者未指定</em>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
