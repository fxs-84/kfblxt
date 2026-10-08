import { type Entity, type Repository } from "../../lib/repository";
import { lazyPersistent } from "../../lib/storage";
import { MOCK_SESSION } from "../../lib/session";
import { canTransition, type Appointment, type AppointmentStatus } from "./appointment.types";

/**
 * 预约仓储(localStorage 模式)。
 *
 * 注意:状态机校验只对 status 字段做。表单改时间/项目/备注不在这里校验 —
 * validate 仅在 create 时被调用,update 由 hooks 层控制(允许用户反悔)。
 */

export type AppointmentRecord = Omit<Appointment, "id" | "createdAt"> & Entity;

export interface AppointmentInput {
  patientId: string;
  orgId: string;
  projectName: string;
  startAt: Date;
  durationMin: number;
  therapistId: string;
  status?: AppointmentStatus;
  note?: string;
}

function validate(input: AppointmentInput): AppointmentInput {
  if (!input.patientId) throw new Error("客户必选");
  if (!input.projectName || !input.projectName.trim()) throw new Error("项目名必填");
  if (!(input.startAt instanceof Date) || Number.isNaN(input.startAt.getTime())) {
    throw new Error("起始时间必填");
  }
  if (!Number.isFinite(input.durationMin) || input.durationMin <= 0) {
    throw new Error("时长必须为正整数分钟");
  }
  if (!input.therapistId) throw new Error("负责治疗师必选");
  if (input.status && !canTransition(input.status, input.status)) {
    throw new Error(`非法状态: ${input.status}`);
  }
  return input;
}

// 种子数据 — 覆盖 5 个状态,便于演示看板
const P1 = "aaaaaaaa-0000-4000-8000-000000000001"; // 张伟
const P2 = "aaaaaaaa-0000-4000-8000-000000000002"; // 李娜
const T1 = MOCK_SESSION.userId; // anonymous(单机演示)

const todayAt = (h: number, m: number) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};
const daysFromNow = (days: number, h: number, m: number) => {
  const d = todayAt(h, m);
  d.setDate(d.getDate() + days);
  return d;
};

const seed: AppointmentRecord[] = [
  {
    id: "ap000001-0000-4000-8000-000000000001",
    createdAt: new Date("2026-10-05"),
    patientId: P1,
    orgId: MOCK_SESSION.orgId,
    projectName: "颈椎训练",
    startAt: todayAt(14, 0),
    durationMin: 45,
    therapistId: T1,
    status: "pending",
    note: "客户主诉落枕复发",
  },
  {
    id: "ap000001-0000-4000-8000-000000000002",
    createdAt: new Date("2026-10-06"),
    patientId: P2,
    orgId: MOCK_SESSION.orgId,
    projectName: "步态评估",
    startAt: todayAt(16, 30),
    durationMin: 60,
    therapistId: T1,
    status: "confirmed",
  },
  {
    id: "ap000001-0000-4000-8000-000000000003",
    createdAt: new Date("2026-10-04"),
    patientId: P1,
    orgId: MOCK_SESSION.orgId,
    projectName: "脑区定位表复评",
    startAt: todayAt(9, 30),
    durationMin: 30,
    therapistId: T1,
    status: "checked_in",
  },
  {
    id: "ap000001-0000-4000-8000-000000000004",
    createdAt: new Date("2026-10-01"),
    patientId: P2,
    orgId: MOCK_SESSION.orgId,
    projectName: "颈椎训练",
    startAt: daysFromNow(-3, 15, 0),
    durationMin: 45,
    therapistId: T1,
    status: "completed",
  },
  {
    id: "ap000001-0000-4000-8000-000000000005",
    createdAt: new Date("2026-10-06"),
    patientId: P1,
    orgId: MOCK_SESSION.orgId,
    projectName: "步态评估",
    startAt: daysFromNow(1, 10, 0),
    durationMin: 60,
    therapistId: T1,
    status: "pending",
    note: "客户临时约",
  },
];

export const appointmentRepository: Repository<AppointmentRecord, AppointmentInput> =
  lazyPersistent<AppointmentRecord, AppointmentInput>("appointments", seed, { validate });

/** 全量(按开始时间升序) */
export async function findAllAppointments(): Promise<AppointmentRecord[]> {
  const all = await appointmentRepository.findAll();
  return all.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

/** 某客户的所有预约 */
export async function findAppointmentsByPatient(patientId: string): Promise<AppointmentRecord[]> {
  const all = await findAllAppointments();
  return all.filter((a) => a.patientId === patientId);
}

/** 临近预约(默认 24h 内,排除已完成/已取消) */
export async function findUpcomingAppointments(hoursAhead = 24): Promise<AppointmentRecord[]> {
  const all = await findAllAppointments();
  const now = Date.now();
  const cutoff = now + hoursAhead * 3600 * 1000;
  return all.filter(
    (a) =>
      a.status !== "completed" &&
      a.status !== "cancelled" &&
      a.startAt.getTime() >= now - 3600 * 1000 && // 容忍 1h 内已开始的(可能还在进行)
      a.startAt.getTime() <= cutoff,
  );
}

/** 状态流转专用入口:在这里做 canTransition 校验 */
export async function transitionAppointment(
  id: string,
  to: AppointmentStatus,
): Promise<AppointmentRecord> {
  const current = await appointmentRepository.findById(id);
  if (!current) throw new Error("预约不存在");
  if (!canTransition(current.status, to)) {
    throw new Error(`不允许从「${current.status}」变更为「${to}」`);
  }
  const updated = await appointmentRepository.update(id, { status: to });
  return updated;
}
