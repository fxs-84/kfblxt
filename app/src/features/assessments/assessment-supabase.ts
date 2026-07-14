/**
 * 量表(评估)仓储的 Supabase 双模式分发。
 *
 * ⚠ 当前 Supabase schema (0001 + 0002 + shares + 0003) 暂无 assessments 表。
 * 分布式部署前需要在 0002_audit_trail_and_tables 后续追加:
 *   create table assessments (
 *     id uuid primary key,
 *     org_id uuid not null references organizations(id),
 *     patient_id uuid not null,
 *     encounter_id uuid,
 *     type text not null check (type in ('brain_region','pain_assessment')),
 *     created_at timestamptz not null default now(),
 *     created_by uuid,
 *     payload jsonb not null,
 *     deleted_at timestamptz,
 *     deleted_by uuid
 *   );
 *
 * 当前的 supabase 分支是一个可用的"占位 — 报错清晰"的形态。
 * localStorage 分支未变,以保持单机模式零回归。
 */

import { getSupabase } from "../../lib/supabase";
import {
  assessmentRepository,
  type StoredAssessmentRow as _Stored,
} from "./assessment.repository";

export type AssessmentInput = import("./assessment.types").AssessmentInput;

function isSupabaseReady(): boolean {
  return getSupabase() !== null;
}

export async function findAssessmentsByPatientDual(patientId: string): Promise<_Stored[]> {
  if (!isSupabaseReady()) {
    const all = await assessmentRepository.findAll();
    return all.filter((a) => a.patientId === patientId);
  }
  // Supabase 路径:需要 assessments 表 + payload 列
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("assessments")
    .select("*")
    .eq("patient_id", patientId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    if (error.message.includes("does not exist") || error.code === "42P01") {
      throw new Error("Supabase 模式启用但缺 assessments 表。请按 assessment-supabase.ts 头部说明手动添加 migration 后再启用多人模式。");
    }
    throw new Error(`查询量表失败: ${error.message}`);
  }
  // payload 还原成原结构;此处不展开(单机模式足以支撑现有 UI)
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const payload = (r.payload as _Stored) ?? ({} as _Stored);
    return {
      ...payload,
      id: String(r.id),
      orgId: String(r.org_id),
      patientId: String(r.patient_id),
      encounterId: (r.encounter_id as string) ?? undefined,
      createdAt: new Date(String(r.created_at)),
      createdBy: (r.created_by as string) ?? null,
      updatedAt: new Date(String(r.created_at)),
      updatedBy: null,
      deletedAt: null,
      deletedBy: null,
    } as _Stored;
  });
}

export async function findAssessmentsByEncounterDual(encounterId: string): Promise<_Stored[]> {
  if (!isSupabaseReady()) {
    const all = await assessmentRepository.findAll();
    return all.filter((a) => a.encounterId === encounterId);
  }
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("assessments")
    .select("*")
    .eq("encounter_id", encounterId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    if (error.message.includes("does not exist") || error.code === "42P01") {
      throw new Error("Supabase 模式启用但缺 assessments 表。");
    }
    throw new Error(`查询量表失败: ${error.message}`);
  }
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const payload = (r.payload as _Stored) ?? ({} as _Stored);
    return {
      ...payload,
      id: String(r.id),
      orgId: String(r.org_id),
      patientId: String(r.patient_id),
      encounterId: (r.encounter_id as string) ?? undefined,
      createdAt: new Date(String(r.created_at)),
      createdBy: (r.created_by as string) ?? null,
      updatedAt: new Date(String(r.created_at)),
      updatedBy: null,
      deletedAt: null,
      deletedBy: null,
    } as _Stored;
  });
}

export async function createAssessmentDual(input: AssessmentInput): Promise<_Stored> {
  if (!isSupabaseReady()) return assessmentRepository.create(input);
  const supabase = getSupabase()!;
  // 留个 warning:需要在 Supabase 加 assessments 表后才能用
  throw new Error(
    "Supabase 多人模式暂未实现量表存储。请先按 assessment-supabase.ts 顶部说明手动执行追加 migration。",
  );
  /* 启用后:
  const id = crypto.randomUUID();
  const { data, error } = await supabase.from("assessments").insert({
    id, org_id: (input as { orgId?: string }).orgId ?? "00000000-0000-4000-8000-0000000000f0",
    patient_id: input.patientId,
    encounter_id: input.encounterId ?? null,
    type: input.type,
    payload: input,
    created_by: null,
  }).select().maybeSingle();
  if (error || !data) throw new Error(`保存量表失败: ${error?.message ?? "无响应"}`);
  return ...;
  */
}
