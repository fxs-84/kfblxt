import { formatDate } from "../../../lib/format";
import { useProfile } from "../../../lib/profiles";
import { usePatient } from "../../patients/usePatients";
import type { AppointmentRecord } from "../appointment.repository";
import { getUrgency } from "../appointment.types";

interface AppointmentCardProps {
  record: AppointmentRecord;
  /** 拖拽开始回调(把 appointmentId 写入 dataTransfer 由父级提供) */
  onDragStart?: (e: React.DragEvent<HTMLElement>, id: string) => void;
  onDragEnd?: (e: React.DragEvent<HTMLElement>) => void;
  /** 点击卡片(打开编辑弹窗) */
  onClick?: (record: AppointmentRecord) => void;
  /** 是否处于拖拽中(用于半透明) */
  dragging?: boolean;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/**
 * 看板卡片 — 单条预约的最小可视单元。
 * 显示: 客户名 / 项目 / 时间+时长 / 负责治疗师 / 紧急度标记。
 */
export function AppointmentCard({ record, onDragStart, onDragEnd, onClick, dragging }: AppointmentCardProps) {
  const { data: patient } = usePatient(record.patientId);
  const therapist = useProfile(record.therapistId);
  const urgency = getUrgency(record.startAt);

  const isActive = record.status !== "completed" && record.status !== "cancelled";

  return (
    <article
      className={`kanban-card ${dragging ? "kanban-card--dragging" : ""}`}
      draggable
      onDragStart={(e) => onDragStart?.(e, record.id)}
      onDragEnd={onDragEnd}
      onClick={() => onClick?.(record)}
      data-testid={`appointment-card-${record.id}`}
      aria-label={`${patient?.name ?? record.patientId} · ${record.projectName}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.(record);
        }
      }}
    >
      <header className="kanban-card__head">
        <strong className="kanban-card__patient">{patient?.name ?? "…"}</strong>
        {isActive && (urgency === "overdue" || urgency === "today") && (
          <span
            className={`kanban-card__urgent kanban-card__urgent--${urgency}`}
            title={urgency === "overdue" ? "已过期(客户应到未到)" : "今天"}
            aria-label={urgency === "overdue" ? "已过期" : "今天"}
          />
        )}
      </header>
      <div className="kanban-card__project">{record.projectName}</div>
      <div className="kanban-card__meta">
        <span>{formatDate(record.startAt)} {formatTime(record.startAt)}</span>
        <span>·</span>
        <span>{record.durationMin} 分钟</span>
      </div>
      <div className="kanban-card__meta kanban-card__meta--muted">
        <span>👤 {therapist?.fullName ?? record.therapistId}</span>
      </div>
      {record.note && (
        <div className="kanban-card__note" title={record.note}>📝 {record.note}</div>
      )}
    </article>
  );
}
