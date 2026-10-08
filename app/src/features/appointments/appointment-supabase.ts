/**
 * 预约仓储的 Supabase 双模式分发。
 * 分发规则与 followup-supabase.ts 一致:getSupabase() 非空走云端,否则落 localStorage。
 */

import { getSession } from "../../lib/session";
import { getSupabase } from "../../lib/supabase";
import {
  appointmentRepository,
  transitionAppointment as transitionLocal,
  type AppointmentInput,
  type AppointmentRecord,
} from "./appointment.repository";
import { canTransition, type AppointmentStatus } from "./appointment.types";

function isSupabaseReady(): boolean {
  return getSupabase() !== null;
}

function toRow(input: AppointmentInput & { id: string; createdAt: Date }, actorIdOverride?: string): Record<string, unknown> {
  return {
    id: input.id,
    org_id: input.orgId,
    patient_id: input.patientId,
    project_name: input.projectName,
    start_at: input.startAt instanceof Date ? input.startAt.toISOString() : String(input.startAt),
    duration_min: input.durationMin,
    therapist_id: input.therapistId,
    status: input.status ?? "pending",
    note: input.note ?? null,
    created_at: input.createdAt.toISOString(),
    created_by: actorIdOverride ?? getSession().userId,
  };
}

function fromRow(row: Record<string, unknown>): AppointmentRecord {
  const start = row.start_at;
  const crt = row.created_at;
  const upd = row.updated_at;
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    patientId: String(row.patient_id),
    projectName: String(row.project_name ?? ""),
    startAt: new Date(typeof start === "string" ? start : String(start)),
    durationMin: Number(row.duration_min ?? 0),
    therapistId: String(row.therapist_id ?? ""),
    status: row.status as AppointmentRecord["status"],
    note: (row.note as string) ?? undefined,
    createdAt: new Date(typeof crt === "string" ? crt : String(crt)),
    createdBy: (row.created_by as string) ?? undefined,
    updatedAt: upd ? new Date(typeof upd === "string" ? upd : String(upd)) : undefined,
    updatedBy: (row.updated_by as string) ?? undefined,
    deletedAt: undefined,
    deletedBy: undefined,
  };
}

export async function findAllAppointmentsDual(): Promise<AppointmentRecord[]> {
  if (!isSupabaseReady()) {
    const all = await appointmentRepository.findAll();
    return all.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  }
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .is("deleted_at", null)
    .order("start_at", { ascending: true });
  if (error) throw new Error(`查询预约失败: ${error.message}`);
  return (data ?? []).map(fromRow);
}

export async function findAppointmentsByPatientDual(patientId: string): Promise<AppointmentRecord[]> {
  if (!isSupabaseReady()) {
    const all = await appointmentRepository.findAll();
    return all.filter((a) => a.patientId === patientId).sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  }
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("patient_id", patientId)
    .is("deleted_at", null)
    .order("start_at", { ascending: true });
  if (error) throw new Error(`查询预约失败: ${error.message}`);
  return (data ?? []).map(fromRow);
}

export async function findUpcomingAppointmentsDual(hoursAhead = 24): Promise<AppointmentRecord[]> {
  const all = await findAllAppointmentsDual();
  const now = Date.now();
  const cutoff = now + hoursAhead * 3600 * 1000;
  return all.filter(
    (a) =>
      a.status !== "completed" &&
      a.status !== "cancelled" &&
      a.startAt.getTime() >= now - 3600 * 1000 &&
      a.startAt.getTime() <= cutoff,
  );
}

export async function createAppointmentDual(input: AppointmentInput): Promise<AppointmentRecord> {
  if (!isSupabaseReady()) return appointmentRepository.create(input);
  const supabase = getSupabase()!;
  const id = crypto.randomUUID();
  const createdAt = new Date();
  const { data, error } = await supabase.from("appointments").insert(toRow({ ...input, id, createdAt })).select().maybeSingle();
  if (error || !data) throw new Error(`保存预约失败: ${error?.message ?? "无响应"}`);
  return fromRow(data);
}

export async function updateAppointmentDual(
  id: string,
  patch: Partial<AppointmentInput>,
): Promise<AppointmentRecord | null> {
  if (!isSupabaseReady()) return appointmentRepository.update(id, patch);
  const supabase = getSupabase()!;
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.patientId !== undefined) row.patient_id = patch.patientId;
  if (patch.projectName !== undefined) row.project_name = patch.projectName;
  if (patch.startAt !== undefined) row.start_at = patch.startAt instanceof Date ? patch.startAt.toISOString() : patch.startAt;
  if (patch.durationMin !== undefined) row.duration_min = patch.durationMin;
  if (patch.therapistId !== undefined) row.therapist_id = patch.therapistId;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.note !== undefined) row.note = patch.note;
  const { data, error } = await supabase.from("appointments").update(row).eq("id", id).select().maybeSingle();
  if (error || !data) return null;
  return fromRow(data);
}

/** 状态流转(带状态机校验)。Supabase 模式也要先读当前状态再校验。 */
export async function transitionAppointmentDual(id: string, to: AppointmentStatus): Promise<AppointmentRecord> {
  if (!isSupabaseReady()) return transitionLocal(id, to);
  const supabase = getSupabase()!;
  const { data: current, error: readError } = await supabase
    .from("appointments")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (readError) throw new Error(`读取预约失败: ${readError.message}`);
  if (!current) throw new Error("预约不存在");
  const from = current.status as AppointmentStatus;
  if (!canTransition(from, to)) {
    throw new Error(`不允许从「${from}」变更为「${to}」`);
  }
  const { data, error } = await supabase
    .from("appointments")
    .update({ status: to, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error || !data) throw new Error(`变更预约状态失败: ${error?.message ?? "无响应"}`);
  return fromRow(data);
}

export async function deleteAppointmentDual(id: string): Promise<void> {
  if (!isSupabaseReady()) return appointmentRepository.remove(id);
  const supabase = getSupabase()!;
  const { error } = await supabase
    .from("appointments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`删除预约失败: ${error.message}`);
}
