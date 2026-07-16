/**
 * 量表(评估)仓储的 Supabase 双模式分发。
 *
 * 表名:assessments(由 09_assessments.sql 创建)
 * 列:
 *   id uuid PK
 *   org_id uuid FK
 *   patient_id uuid NOT NULL FK
 *   encounter_id uuid (nullable)
 *   type text NOT NULL CHECK (in ('brain_region','pain_assessment'))
 *   payload jsonb NOT NULL  ← 量表答卷数据(除上面 DB 列外的所有字段)
 *   created_at, created_by, updated_at, updated_by, deleted_at, deleted_by
 *
 * 决定权:`getSupabase() !== null` → 走 Supabase,否则 → 落回 localStorage。
 */

import { getSupabase } from "../../lib/supabase";
import {
  assessmentRepository,
  type AssessmentRecordRow,
} from "./assessment.repository";
import type { AssessmentInput } from "./assessment.types";

function isSupabaseReady(): boolean {
  return getSupabase() !== null;
}

/**
 * 把 AssessmentInput 拆成"DB 顶层列 + payload jsonb"。
 * payload 只保留业务答卷字段(responses/score/phoneEar/note/csi/slanss),
 * 顶部列保留 id/org_id/patient_id/encounter_id/type/created_at/created_by。
 */
function toRow(
  input: AssessmentInput & { id: string; createdAt: Date },
): Record<string, unknown> {
  const { id, orgId, patientId, encounterId, type, createdAt } = input;
  // payload = 原始 input 的全部字段,但剔除顶部已映射的列
  const payload = { ...input };
  delete (payload as Record<string, unknown>).id;
  delete (payload as Record<string, unknown>).createdAt;
  delete (payload as Record<string, unknown>).createdBy;
  delete (payload as Record<string, unknown>).updatedAt;
  delete (payload as Record<string, unknown>).updatedBy;
  delete (payload as Record<string, unknown>).deletedAt;
  delete (payload as Record<string, unknown>).deletedBy;

  return {
    id,
    org_id: orgId,
    patient_id: patientId,
    encounter_id: (encounterId && encounterId !== "new") ? encounterId : null,
    type,
    payload,
    created_at: createdAt.toISOString(),
    created_by: null,
  };
}

/**
 * DB 行 → 业务记录。
 * payload 中的字段先展开,再用顶部列(id/orgId/patientId/encounterId/createdAt)
 * 覆盖,保证类型与 DB 列完全一致。
 */
function fromRow(row: Record<string, unknown>): AssessmentRecordRow {
  const payload = (row.payload as Record<string, unknown> | null) ?? {};
  const createdStr = String(row.created_at);
  const merged = { ...payload } as Record<string, unknown>;
  // 顶部列以 DB 为准
  merged.id = String(row.id);
  merged.orgId = String(row.org_id);
  merged.patientId = String(row.patient_id);
  merged.encounterId = row.encounter_id ? String(row.encounter_id) : undefined;
  merged.type = String(row.type);
  merged.createdAt = new Date(createdStr);
  merged.createdBy = (row.created_by as string) ?? null;
  merged.updatedAt = new Date(createdStr);
  merged.updatedBy = null;
  merged.deletedAt = null;
  merged.deletedBy = null;
  return merged as unknown as AssessmentRecordRow;
}

export async function findAssessmentsByPatientDual(patientId: string): Promise<AssessmentRecordRow[]> {
  if (!isSupabaseReady()) {
    const all = await assessmentRepository.findAll();
    return all
      .filter((a) => a.patientId === patientId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("assessments")
    .select("*")
    .eq("patient_id", patientId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`查询量表失败: ${error.message}`);
  return (data ?? []).map(fromRow);
}

export async function findAssessmentsByEncounterDual(encounterId: string, patientId?: string): Promise<AssessmentRecordRow[]> {
  if (!isSupabaseReady()) {
    const all = await assessmentRepository.findAll();
    return all
      .filter((a) => a.encounterId === encounterId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  const supabase = getSupabase()!;
  // 同时查 encounter_id 匹配 + encounter_id=null(新建就诊时存的)
  const filter: Record<string, unknown> = { deleted_at: null };
  if (patientId) {
    const { data, error } = await supabase
      .from("assessments")
      .select("*")
      .or(`encounter_id.eq.${encounterId},and(encounter_id.is.null,patient_id.eq.${patientId})`)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`查询量表失败: ${error.message}`);
    return (data ?? []).map(fromRow);
  }
  const { data, error } = await supabase
    .from("assessments")
    .select("*")
    .eq("encounter_id", encounterId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`查询量表失败: ${error.message}`);
  return (data ?? []).map(fromRow);
}

export async function createAssessmentDual(input: AssessmentInput): Promise<AssessmentRecordRow> {
  if (!isSupabaseReady()) return assessmentRepository.create(input);
  const supabase = getSupabase()!;
  const id = crypto.randomUUID();
  const createdAt = new Date();
  const row = toRow({ ...input, id, createdAt });
  const { data, error } = await supabase.from("assessments").insert(row).select().maybeSingle();
  if (error || !data) throw new Error(`保存量表失败: ${error?.message ?? "无响应"}`);
  return fromRow(data as Record<string, unknown>);
}

/** 仅支持对 jsonb payload 内字段的局部更新;type 不允许变更。 */
export async function updateAssessmentDual(
  id: string,
  patch: Partial<AssessmentInput>,
): Promise<AssessmentRecordRow> {
  if (!isSupabaseReady()) {
    return assessmentRepository.update(id, patch as Parameters<typeof assessmentRepository.update>[1]);
  }
  const supabase = getSupabase()!;
  const now = new Date().toISOString();
  const row: Record<string, unknown> = { updated_at: now };
  // encounter_id 可单独更新;payload 整体 merge
  if (patch.encounterId !== undefined) {
    row.encounter_id = patch.encounterId ?? null;
  }
  // 读出当前行,payload 合并 patch 后写回
  const { data: current, error: readErr } = await supabase
    .from("assessments")
    .select("payload")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr || !current) {
    throw new Error(`读取量表失败: ${readErr?.message ?? "记录不存在"}`);
  }
  const currentPayload = (current.payload as Record<string, unknown> | null) ?? {};
  const nextPayload: Record<string, unknown> = { ...currentPayload };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (k === "encounterId") continue; // 已映射到顶部列
    if (k === "id" || k === "orgId" || k === "patientId" || k === "type") continue; // 不可变
    nextPayload[k] = v as unknown;
  }
  row.payload = nextPayload;
  const { data, error } = await supabase
    .from("assessments")
    .update(row)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error || !data) throw new Error(`更新量表失败: ${error?.message ?? "无响应"}`);
  return fromRow(data as Record<string, unknown>);
}

export async function deleteAssessmentDual(id: string): Promise<void> {
  if (!isSupabaseReady()) return assessmentRepository.remove(id);
  const supabase = getSupabase()!;
  const { error } = await supabase
    .from("assessments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`删除量表失败: ${error.message}`);
}