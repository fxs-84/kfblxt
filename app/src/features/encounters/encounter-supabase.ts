/**
 * 就诊仓储的 Supabase 双模式分发。
 * - getSupabase() === null → 落回 encounterRepository(localStorage,行为不变)
 * - 字段映射:Date ↔ ISO timestamptz,主诉对象为 jsonb 存整段
 */

import { getSupabase } from "../../lib/supabase";
import { encounterRepository } from "./encounter.repository";
import type { EncounterRecord, EncounterInput } from "./encounter.repository";

function isSupabaseReady(): boolean {
  return getSupabase() !== null;
}

function toRow(input: EncounterInput & { id: string; createdAt: Date }): Record<string, unknown> {
  return {
    id: input.id,
    org_id: input.orgId,
    patient_id: input.patientId,
    encounter_date: input.encounterDate instanceof Date ? input.encounterDate.toISOString() : String(input.encounterDate),
    visit_type: input.visitType,
    status: input.status,
    chief_complaint: input.chiefComplaint,
    created_at: input.createdAt.toISOString(),
    created_by: null,
  };
}

function fromRow(row: Record<string, unknown>): EncounterRecord {
  const enc = row.encounter_date;
  const crt = row.created_at;
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    patientId: String(row.patient_id),
    encounterDate: new Date(typeof enc === "string" ? enc : String(enc)),
    visitType: row.visit_type as EncounterRecord["visitType"],
    status: row.status as EncounterRecord["status"],
    amount: typeof row.amount === "number" ? row.amount : 0,
    chiefComplaint: row.chief_complaint as EncounterRecord["chiefComplaint"],
    createdAt: new Date(typeof crt === "string" ? crt : String(crt)),
    createdBy: (row.created_by as string) ?? null,
    updatedAt: new Date(typeof crt === "string" ? crt : String(crt)),
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
  };
}

export async function findEncountersByPatientDual(patientId: string): Promise<EncounterRecord[]> {
  if (!isSupabaseReady()) {
    const all = await encounterRepository.findAll();
    return all
      .filter((e) => e.patientId === patientId)
      .sort((a, b) => b.encounterDate.getTime() - a.encounterDate.getTime());
  }
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("encounters")
    .select("*")
    .eq("patient_id", patientId)
    .is("deleted_at", null)
    .order("encounter_date", { ascending: false });
  if (error) throw new Error(`查询就诊失败: ${error.message}`);
  return (data ?? []).map(fromRow);
}

export async function findEncounterByIdDual(id: string): Promise<EncounterRecord | null> {
  if (!isSupabaseReady()) return encounterRepository.findById(id);
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("encounters")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return fromRow(data);
}

export async function createEncounterDual(input: EncounterInput): Promise<EncounterRecord> {
  if (!isSupabaseReady()) return encounterRepository.create(input);
  const supabase = getSupabase()!;
  const id = crypto.randomUUID();
  const createdAt = new Date();
  const { data, error } = await supabase.from("encounters").insert(toRow({ ...input, id, createdAt })).select().maybeSingle();
  if (error || !data) throw new Error(`创建就诊失败: ${error?.message ?? "无响应"}`);
  return fromRow(data);
}

export async function updateEncounterDual(id: string, patch: Partial<EncounterInput>): Promise<EncounterRecord> {
  if (!isSupabaseReady()) return encounterRepository.update(id, patch);
  const supabase = getSupabase()!;
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.patientId !== undefined) row.patient_id = patch.patientId;
  if (patch.encounterDate !== undefined) row.encounter_date = patch.encounterDate instanceof Date ? patch.encounterDate.toISOString() : patch.encounterDate;
  if (patch.visitType !== undefined) row.visit_type = patch.visitType;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.chiefComplaint !== undefined) row.chief_complaint = patch.chiefComplaint;
  const { data, error } = await supabase.from("encounters").update(row).eq("id", id).select().maybeSingle();
  if (error || !data) throw new Error(`更新就诊失败: ${error?.message ?? "无响应"}`);
  return fromRow(data);
}

export async function deleteEncounterDual(id: string): Promise<void> {
  if (!isSupabaseReady()) return encounterRepository.remove(id);
  const supabase = getSupabase()!;
  const { error } = await supabase
    .from("encounters")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`删除就诊失败: ${error.message}`);
}
