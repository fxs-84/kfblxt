import { usePatient } from "../../patients/usePatients";
import { formatDate } from "../../../lib/format";
import type { AppointmentRecord } from "../appointment.repository";
import { getUrgency } from "../appointment.types";

interface AppointmentRemindersProps {
  items: AppointmentRecord[];
  /** 点击跳到对应预约(打开编辑) */
  onJump?: (record: AppointmentRecord) => void;
}

function ReminderRow({ record, onJump }: { record: AppointmentRecord; onJump?: (r: AppointmentRecord) => void }) {
  const { data: patient } = usePatient(record.patientId);
  const urgency = getUrgency(record.startAt);
  return (
    <button
      type="button"
      className={`appointment-reminder appointment-reminder--${urgency}`}
      onClick={() => onJump?.(record)}
      data-testid={`reminder-${record.id}`}
    >
      <span className="appointment-reminder__time">
        {formatDate(record.startAt)} {record.startAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}
      </span>
      <span className="appointment-reminder__patient">{patient?.name ?? "…"}</span>
      <span className="appointment-reminder__project">{record.projectName}</span>
    </button>
  );
}

/**
 * 临近预约提醒条 — 看板顶部一条琥珀色横幅。
 * 无临近预约时不渲染。
 */
export function AppointmentReminders({ items, onJump }: AppointmentRemindersProps) {
  if (items.length === 0) return null;

  const today = items.filter((r) => getUrgency(r.startAt) === "today" || getUrgency(r.startAt) === "overdue");
  const soon = items.filter((r) => getUrgency(r.startAt) === "soon");

  return (
    <div className="appointment-reminder-bar" role="region" aria-label="临近预约提醒" data-testid="appointment-reminders">
      <span className="appointment-reminder-bar__icon" aria-hidden>⏰</span>
      <div className="appointment-reminder-bar__text">
        <b>
          今日 {today.length} 条
          {soon.length > 0 && ` · 未来 24h ${soon.length} 条`}
        </b>
        <span className="appointment-reminder-bar__hint">点击查看详情</span>
      </div>
      <div className="appointment-reminder-bar__list">
        {items.slice(0, 5).map((r) => (
          <ReminderRow key={r.id} record={r} onJump={onJump} />
        ))}
        {items.length > 5 && (
          <span className="appointment-reminder-bar__more">+{items.length - 5}</span>
        )}
      </div>
    </div>
  );
}
