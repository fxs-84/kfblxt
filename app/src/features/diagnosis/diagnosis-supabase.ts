/**
 * 诊断仓储的 Supabase 双模式分发。
 * DB columns:
 *   id / org_id / encounter_id / patient_id / neuro_levels / spinal_segments /
 *   nerve_trunks / cutaneous_nerves / mechanisms / rationale / confidence /
 *   created_at / created_by / updated_at / updated_by / deleted_at
 * 前端模型名 → DB 列名映射在 toRow / fromRow / updateDiagnosisDual 中维护。
 */

import { getSupabase } from "../../lib/supabase";
import { diagnosisRepository, type ClinicalDx } from "./diagnosis.repository";
import type { DiagnosisRecord, DiagnosisInput } from "./diagnosis.repository";

function isSupabaseReady(): boolean {
  return getSupabase() !== null;
}

function toRow(input: DiagnosisInput & { id: string; createdAt: Date; patientId?: string; confidence?: number }): Record<string, unknown> {
  return {
    id: input.id,
    org_id: input.orgId,
    encounter_id: input.encounterId,
    patient_id: input.patientId ?? null,
    neuro_levels: input.levels ?? [],
    spinal_segments: input.segments ?? [],
    nerve_trunks: input.nerves ?? [],
    cutaneous_nerves: input.cutaneousNerveIds ?? [],
    clinical_diagnoses: input.clinicalDiagnoses ?? [],
    mechanisms: input.mechanisms ?? [],
    rationale: input.reasoning ?? null,
    confidence: input.confidence ?? null,
    side: input.side || "left",
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
    levels: (row.neuro_levels as DiagnosisRecord["levels"]) ?? [],
    mechanisms: (row.mechanisms as DiagnosisRecord["mechanisms"]) ?? [],
    segments: (row.spinal_segments as DiagnosisRecord["segments"]) ?? undefined,
    nerves: (row.nerve_trunks as DiagnosisRecord["nerves"]) ?? undefined,
    cutaneousNerveIds: (row.cutaneous_nerves as string[]) ?? undefined,
    clinicalDiagnoses: (row.clinical_diagnoses as DiagnosisRecord["clinicalDiagnoses"]) ?? [],
    side: (row.side as DiagnosisRecord["side"]) ?? "midline",
    reasoning: String(row.rationale ?? ""),
    createdAt: new Date(typeof crt === "string" ? crt : String(crt)),
    createdBy: (row.created_by as string) ?? null,
    updatedAt: new Date(typeof crt === "string" ? crt : String(crt)),
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
  } as DiagnosisRecord;
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

export async function createDiagnosisDual(input: DiagnosisInput & { patientId?: string; confidence?: number }): Promise<DiagnosisRecord> {
  if (!isSupabaseReady()) return diagnosisRepository.create(input);
  const supabase = getSupabase()!;
  const id = crypto.randomUUID();
  const createdAt = new Date();

  // patient_id 必填但 DiagnosisInput 里没有,从 encounter 查
  let patientId = input.patientId;
  if (!patientId && input.encounterId) {
    const { data: enc } = await supabase
      .from("encounters")
      .select("patient_id")
      .eq("id", input.encounterId)
      .maybeSingle();
    if (enc) patientId = enc.patient_id;
  }

  const row = toRow({ ...input, id, createdAt, patientId });
  console.log("[diagnosis-create] sending to Supabase:", JSON.stringify(row));
  const { data, error } = await supabase.from("diagnoses").insert(row).select().maybeSingle();
  if (error || !data) throw new Error(`保存诊断失败: ${error?.message ?? "无响应"}`);
  return fromRow(data);
}

export async function updateDiagnosisDual(id: string, patch: Partial<DiagnosisInput>): Promise<DiagnosisRecord> {
  if (!isSupabaseReady()) return diagnosisRepository.update(id, patch as never);
  const supabase = getSupabase()!;
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.levels !== undefined) row.neuro_levels = patch.levels;
  if (patch.mechanisms !== undefined) row.mechanisms = patch.mechanisms;
  if (patch.segments !== undefined) row.spinal_segments = patch.segments ?? [];
  if (patch.nerves !== undefined) row.nerve_trunks = patch.nerves ?? [];
  if (patch.cutaneousNerveIds !== undefined) row.cutaneous_nerves = patch.cutaneousNerveIds ?? [];
  if (patch.clinicalDiagnoses !== undefined) row.clinical_diagnoses = patch.clinicalDiagnoses ?? [];
  if (patch.reasoning !== undefined) row.rationale = patch.reasoning;
  if (patch.side) row.side = patch.side;
  const { data, error } = await supabase.from("diagnoses").update(row).eq("id", id).select().maybeSingle();
  if (error || !data) throw new Error(`更新诊断失败: ${error?.message ?? "无响应"}`);
  return fromRow(data);
}

export async function deleteDiagnosisDual(id: string): Promise<void> {
  if (!isSupabaseReady()) return diagnosisRepository.remove(id);
  const supabase = getSupabase()!;
  const { error } = await supabase
    .from("diagnoses")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`删除诊断失败: ${error.message}`);
}
