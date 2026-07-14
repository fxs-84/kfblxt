/**
 * 诊断仓储的 Supabase 双模式分发。
 * - LocalizationDiagnosis 含多个 optional 数组字段 → 全部存 jsonb (Supabase 一列存整个)
 *   OR 同步拆成多个 nullable 列(本次选拆开,与 RLS 索引友好)。
 *   columns: levels / mechanisms / segments / nerves / cutaneousNerveIds / side / reasoning / clinicalDiagnoses
 */

import { getSupabase } from "../../lib/supabase";
import { diagnosisRepository, type ClinicalDx } from "./diagnosis.repository";
import type { DiagnosisRecord, DiagnosisInput } from "./diagnosis.repository";

function isSupabaseReady(): boolean {
  return getSupabase() !== null;
}

function toRow(input: DiagnosisInput & { id: string; createdAt: Date }): Record<string, unknown> {
  return {
    id: input.id,
    org_id: input.orgId,
    encounter_id: input.encounterId,
    levels: input.levels,
    mechanisms: input.mechanisms,
    segments: input.segments ?? null,
    nerves: input.nerves ?? null,
    cutaneous_nerve_ids: input.cutaneousNerveIds ?? null,
    side: input.side,
    reasoning: input.reasoning,
    clinical_diagnoses: input.clinicalDiagnoses ?? null,
    created_at: input.createdAt.toISOString(),
    created_by: null,
  };
}

function fromRow(row: Record<string, unknown>): DiagnosisRecord {
  const crt = row.created_at;
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    encounterId: String(row.encounter_id),
    levels: (row.levels as DiagnosisRecord["levels"]) ?? [],
    mechanisms: (row.mechanisms as DiagnosisRecord["mechanisms"]) ?? [],
    segments: (row.segments as DiagnosisRecord["segments"]) ?? undefined,
    nerves: (row.nerves as DiagnosisRecord["nerves"]) ?? undefined,
    cutaneousNerveIds: (row.cutaneous_nerve_ids as string[]) ?? undefined,
    side: row.side as DiagnosisRecord["side"],
    reasoning: String(row.reasoning ?? ""),
    clinicalDiagnoses: (row.clinical_diagnoses as ClinicalDx[] | null) ?? undefined,
    createdAt: new Date(typeof crt === "string" ? crt : String(crt)),
    createdBy: (row.created_by as string) ?? null,
    updatedAt: new Date(typeof crt === "string" ? crt : String(crt)),
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
  };
}

export async function findDiagnosisByEncounterDual(encounterId: string): Promise<DiagnosisRecord | null> {
  if (!isSupabaseReady()) {
    const found = await diagnosisRepository.findAll();
    const list = found.filter((d) => d.encounterId === encounterId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return list[0] ?? null;
  }
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("diagnoses")
    .select("*")
    .eq("encounter_id", encounterId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return fromRow(data);
}

export async function createDiagnosisDual(input: DiagnosisInput): Promise<DiagnosisRecord> {
  if (!isSupabaseReady()) return diagnosisRepository.create(input);
  const supabase = getSupabase()!;
  const id = crypto.randomUUID();
  const createdAt = new Date();
  const { data, error } = await supabase.from("diagnoses").insert(toRow({ ...input, id, createdAt })).select().maybeSingle();
  if (error || !data) throw new Error(`保存诊断失败: ${error?.message ?? "无响应"}`);
  return fromRow(data);
}

export async function updateDiagnosisDual(id: string, patch: Partial<DiagnosisInput>): Promise<DiagnosisRecord> {
  if (!isSupabaseReady()) return diagnosisRepository.update(id, patch as never);
  const supabase = getSupabase()!;
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.levels !== undefined) row.levels = patch.levels;
  if (patch.mechanisms !== undefined) row.mechanisms = patch.mechanisms;
  if (patch.segments !== undefined) row.segments = patch.segments ?? null;
  if (patch.nerves !== undefined) row.nerves = patch.nerves ?? null;
  if (patch.cutaneousNerveIds !== undefined) row.cutaneous_nerve_ids = patch.cutaneousNerveIds ?? null;
  if (patch.side !== undefined) row.side = patch.side;
  if (patch.reasoning !== undefined) row.reasoning = patch.reasoning;
  if (patch.clinicalDiagnoses !== undefined) row.clinical_diagnoses = patch.clinicalDiagnoses ?? null;
  const { data, error } = await supabase.from("diagnoses").update(row).eq("id", id).select().maybeSingle();
  if (error || !data) throw new Error(`更新诊断失败: ${error?.message ?? "无响应"}`);
  return fromRow(data);
}

export async function deleteDiagnosisDual(id: string): Promise<void> {
  if (!isSupabaseReady()) return diagnosisRepository.remove(id);
  const supabase = getSupabase()!;
  const { error } = await supabase
    .from("diagnoses")
    .update({ deleted_at: new Date().toISOString(), deleted_by: null })
    .eq("id", id);
  if (error) throw new Error(`删除诊断失败: ${error.message}`);
}
