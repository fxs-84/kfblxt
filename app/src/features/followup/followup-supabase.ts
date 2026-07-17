/**
 * 复诊提醒仓储的 Supabase 双模式分发。
 */

import { getSession } from "../../lib/session";
import { getSupabase } from "../../lib/supabase";
import { followupRepository, type FollowupRecord, type FollowupInput } from "./followup.repository";

function isSupabaseReady(): boolean {
  return getSupabase() !== null;
}

function toRow(input: FollowupInput & { id: string; createdAt: Date }): Record<string, unknown> {
  return {
    id: input.id,
    org_id: input.orgId,
    patient_id: input.patientId,
    due_date: input.dueDate instanceof Date ? input.dueDate.toISOString() : String(input.dueDate),
    note: input.note,
    status: input.status || "待复诊",
    completed_encounter_id: input.completedEncounterId ?? null,
    created_at: input.createdAt.toISOString(),
    created_by: getSession().userId,
  };
}

function fromRow(row: Record<string, unknown>): FollowupRecord {
  const due = row.due_date;
  const crt = row.created_at;
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    patientId: String(row.patient_id),
    dueDate: new Date(typeof due === "string" ? due : String(due)),
    note: String(row.note ?? ""),
    status: row.status as FollowupRecord["status"],
    completedEncounterId: (row.completed_encounter_id as string) ?? undefined,
    createdAt: new Date(typeof crt === "string" ? crt : String(crt)),
    createdBy: (row.created_by as string) ?? null,
    updatedAt: new Date(typeof crt === "string" ? crt : String(crt)),
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
  };
}

export async function findFollowupsByPatientDual(patientId: string): Promise<FollowupRecord[]> {
  if (!isSupabaseReady()) {
    const all = await followupRepository.findAll();
    return all.filter((f) => f.patientId === patientId).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("followups")
    .select("*")
    .eq("patient_id", patientId)
    .is("deleted_at", null)
    .order("due_date", { ascending: true });
  if (error) throw new Error(`查询复诊失败: ${error.message}`);
  return (data ?? []).map(fromRow);
}

export async function findAllPendingDual(): Promise<FollowupRecord[]> {
  if (!isSupabaseReady()) {
    const all = await followupRepository.findAll();
    return all.filter((f) => f.status === "待复诊").sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("followups")
    .select("*")
    .eq("status", "待复诊")
    .is("deleted_at", null)
    .order("due_date", { ascending: true });
  if (error) throw new Error(`查询待复诊失败: ${error.message}`);
  return (data ?? []).map(fromRow);
}

export async function createFollowupDual(input: FollowupInput): Promise<FollowupRecord> {
  if (!isSupabaseReady()) return followupRepository.create(input);
  const supabase = getSupabase()!;
  const id = crypto.randomUUID();
  const createdAt = new Date();
  const { data, error } = await supabase.from("followups").insert(toRow({ ...input, id, createdAt })).select().maybeSingle();
  if (error || !data) throw new Error(`保存复诊失败: ${error?.message ?? "无响应"}`);
  return fromRow(data);
}

export async function updateFollowupDual(id: string, patch: Partial<FollowupInput>): Promise<FollowupRecord | null> {
  if (!isSupabaseReady()) return followupRepository.update(id, patch);
  const supabase = getSupabase()!;
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.patientId !== undefined) row.patient_id = patch.patientId;
  if (patch.dueDate !== undefined) row.due_date = patch.dueDate instanceof Date ? patch.dueDate.toISOString() : patch.dueDate;
  if (patch.note !== undefined) row.note = patch.note;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.completedEncounterId !== undefined) row.completed_encounter_id = patch.completedEncounterId;
  const { data, error } = await supabase.from("followups").update(row).eq("id", id).select().maybeSingle();
  if (error || !data) return null;
  return fromRow(data);
}

export async function deleteFollowupDual(id: string): Promise<void> {
  if (!isSupabaseReady()) return followupRepository.remove(id);
  const supabase = getSupabase()!;
  const { error } = await supabase
    .from("followups")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`删除复诊失败: ${error.message}`);
}
