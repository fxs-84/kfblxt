/**
 * 客户仓储的 Supabase 双模式分支。
 *
 * 决定权:`getSupabase() !== null` → 走 Supabase,否则 → 落回 localStorage。
 *
 * 患者表存在 RLS:WHERE org_id = current_org_id()。这是机构级别隔离。
 * 当前仅用 anon key,直接在 SELECT/INSERT 时由 RLS 强制。
 *
 * 注意:对 Date 类型,Postgres timestamptz 是 timezone-aware;
 *       我们的 PatientRecord.birthDate 是 Date,必须 ISO 序列化。
 */

import { getSupabase } from "../../lib/supabase";
import { patientRepository } from "./patient.repository";
import type { PatientRecord, PatientInput } from "./patient.repository";

function isSupabaseReady(): boolean {
  return getSupabase() !== null;
}

/** 生成唯一病历号:ANRM-YYYYMMDD-NNN (与 localStorage 版一致) */
function generateMRN(): string {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const seq = String(Math.floor(Math.random() * 900) + 100);
  return `ANRM-${today}-${seq}`;
}

function toRow(p: PatientInput & { id: string; createdAt: Date }): Record<string, unknown> {
  return {
    id: p.id,
    org_id: p.orgId,
    medical_record_no: p.medicalRecordNo || generateMRN(),
    name: p.name,
    sex: p.sex,
    birth_date: p.birthDate instanceof Date ? p.birthDate.toISOString().slice(0, 10) : String(p.birthDate),
    phone: p.phone || null,
    dominant_hand: p.dominantHand || null,
    created_at: p.createdAt.toISOString(),
    created_by: null,
  };
}

function fromRow(row: Record<string, unknown>): PatientRecord {
  const birthStr = String(row.birth_date);
  const createdStr = String(row.created_at);
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    medicalRecordNo: String(row.medical_record_no),
    name: String(row.name),
    sex: row.sex as PatientRecord["sex"],
    birthDate: new Date(birthStr),
    phone: (row.phone as string) ?? undefined,
    dominantHand: (row.dominant_hand as PatientRecord["dominantHand"]) ?? undefined,
    createdAt: new Date(createdStr),
    createdBy: (row.created_by as string) ?? null,
    updatedAt: new Date(createdStr),
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
  };
}

export async function findAllPatientsSupabase(orgId: string): Promise<PatientRecord[]> {
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("patients")
    .select("*")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`查询客户失败: ${error.message}`);
  return (data ?? []).map(fromRow);
}

export async function createPatientSupabase(input: PatientInput): Promise<PatientRecord> {
  const supabase = getSupabase()!;
  const id = crypto.randomUUID();
  const createdAt = new Date();
  const payload = toRow({ ...input, id, createdAt });
  const { data, error } = await supabase.from("patients").insert(payload).select().maybeSingle();
  if (error || !data) throw new Error(`创建客户失败: ${error?.message ?? "无响应"}`);
  return fromRow(data);
}

export async function updatePatientSupabase(id: string, patch: Partial<PatientInput>): Promise<PatientRecord> {
  const supabase = getSupabase()!;
  const now = new Date().toISOString();
  const row: Record<string, unknown> = { updated_at: now };
  if (patch.medicalRecordNo !== undefined) row.medical_record_no = patch.medicalRecordNo;
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.sex !== undefined) row.sex = patch.sex;
  if (patch.birthDate !== undefined) row.birth_date = patch.birthDate instanceof Date ? patch.birthDate.toISOString().slice(0, 10) : patch.birthDate;
  if (patch.phone !== undefined) row.phone = patch.phone || null;
  if (patch.dominantHand !== undefined) row.dominant_hand = patch.dominantHand || null;
  const { data, error } = await supabase.from("patients").update(row).eq("id", id).select().maybeSingle();
  if (error || !data) throw new Error(`更新客户失败: ${error?.message ?? "无响应"}`);
  return fromRow(data);
}

export async function deletePatientSupabase(id: string): Promise<void> {
  const supabase = getSupabase()!;
  const { error } = await supabase
    .from("patients")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`删除客户失败: ${error.message}`);
}

/**
 * 双模式分发包装 — 业务侧应优先调这些函数,而不是 raw patientRepository
 */
export async function findAllPatientsDual(orgId: string): Promise<PatientRecord[]> {
  if (!isSupabaseReady()) {
    const all = await patientRepository.findAll();
    return all.filter((p) => p.orgId === orgId);
  }
  return findAllPatientsSupabase(orgId);
}

export async function createPatientDual(input: PatientInput): Promise<PatientRecord> {
  if (!isSupabaseReady()) {
    return patientRepository.create(input);
  }
  return createPatientSupabase(input);
}

export async function updatePatientDual(id: string, patch: Partial<PatientInput>): Promise<PatientRecord> {
  if (!isSupabaseReady()) {
    return patientRepository.update(id, patch);
  }
  return updatePatientSupabase(id, patch);
}

export async function deletePatientDual(id: string): Promise<void> {
  if (!isSupabaseReady()) {
    return patientRepository.remove(id);
  }
  return deletePatientSupabase(id);
}
