/**
 * 客户预约(Appointment) — 领域模型 + 状态机。
 *
 * 顶层设计:
 *   · 看板按 status 分列(待确认 → 已确认 → 已到店 → 已完成 / 已取消)
 *   · 状态机由 canTransition() 约束,仅在拖拽时校验;表单编辑不校验(允许反悔)
 *   · 4 个必填字段:patientId / projectName / startAt+durationMin / therapistId
 *
 * 与 followup 的差别:followup 是"到期提醒"(单日期),appointment 是"一段时间预约"(start+duration)
 * 且要驱动看板,状态数也比 followup 多。
 */

export type AppointmentStatus = "pending" | "confirmed" | "checked_in" | "completed" | "cancelled";

export const APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  "pending",
  "confirmed",
  "checked_in",
  "completed",
  "cancelled",
];

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: "待确认",
  confirmed: "已确认",
  checked_in: "已到店",
  completed: "已完成",
  cancelled: "已取消",
};

/** 状态配色 token(供卡片/列头统一使用) */
export const APPOINTMENT_STATUS_TONES: Record<AppointmentStatus, "caution" | "accent" | "normal" | "muted" | "abnormal"> = {
  pending: "caution",
  confirmed: "accent",
  checked_in: "normal",
  completed: "muted",
  cancelled: "abnormal",
};

/**
 * 状态机:拖拽 / 程序化变更的合法性约束。
 *
 * 规则:
 *   · 正向流转:pending → confirmed → checked_in → completed
 *   · 任意非终态可 → cancelled(用户/客户取消预约)
 *   · completed / cancelled 是终态,不可改回
 *   · 同状态 canTransition(x, x) = true(幂等,允许"原地放下")
 */
const FORWARD: Record<AppointmentStatus, AppointmentStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["checked_in", "cancelled"],
  checked_in: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  if (from === to) return true;
  return FORWARD[from].includes(to);
}

/** 紧急度分档(用于卡片角标 + 提醒条) */
export type AppointmentUrgency = "overdue" | "today" | "soon" | "future";

/**
 * 根据 startAt 计算紧急度。
 *   - overdue:开始时间已过但状态还是 pending/confirmed(客户应到未到)
 *   - today:今天内
 *   - soon:未来 24h 内(但已跨日)
 *   - future:24h 以外
 */
export function getUrgency(startAt: Date, now: Date = new Date()): AppointmentUrgency {
  const startMs = startAt.getTime();
  const nowMs = now.getTime();
  if (startMs < nowMs) return "overdue";

  const sameDay =
    startAt.getFullYear() === now.getFullYear() &&
    startAt.getMonth() === now.getMonth() &&
    startAt.getDate() === now.getDate();
  if (sameDay) return "today";

  const HOURS_24 = 24 * 3600 * 1000;
  if (startMs - nowMs <= HOURS_24) return "soon";
  return "future";
}

/** 主实体 */
export interface Appointment {
  id: string;
  orgId: string;
  patientId: string;
  /** 服务/项目名,如「颈椎训练」「步态评估」 */
  projectName: string;
  /** 起始时间 */
  startAt: Date;
  /** 时长(分钟) */
  durationMin: number;
  /** 负责治疗师 userId */
  therapistId: string;
  status: AppointmentStatus;
  /** 备注(可选) */
  note?: string;
}
