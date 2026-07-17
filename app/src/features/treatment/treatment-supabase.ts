/**
 * 治疗计划 / 疗效复评 仓储的 Supabase 双模式分发。
 * treatment_plans + progress_notes 是核心业务表。
 */

import { getSession } from "../../lib/session";
import { getSupabase } from "../../lib/supabase";
import {
  treatmentPlanRepository,
  progressNoteRepository,
  type TreatmentPlanRecord,
  type TreatmentPlanInput,
  type ProgressNoteRecord,
  type ProgressNoteInput,
} from "./treatment.repository";

function isSupabaseReady(): boolean {
  return getSupabase() !== null;
}

/* ---- 治疗计划 ---- */

export function planToRow(input: TreatmentPlanInput & { id: string; createdAt: Date }, actorIdOverride?: string): Record<string, unknown> {
  return {
    id: input.id,
    org_id: input.orgId,
    encounter_id: input.encounterId,
    patient_id: input.patientId,
    phase: input.phase,
    frequency: input.frequency ?? null,
    duration: input.duration ?? null,
    intervention_ids: input.interventionIds,
    intervention_doses: input.interventionDoses ?? {},
    goals: input.goals,
    boundary: input.boundary ?? null,
    notes: input.notes ?? null,
    created_at: input.createdAt.toISOString(),
    created_by: actorIdOverride ?? getSession().userId,
  };
}

function planFromRow(row: Record<string, unknown>): TreatmentPlanRecord {
  const crt = row.created_at;
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    encounterId: String(row.encounter_id),
    patientId: String(row.patient_id),
    phase: row.phase as TreatmentPlanRecord["phase"],
    frequency: (row.frequency as string) ?? "",
    duration: (row.duration as string) ?? "",
    interventionIds: (row.intervention_ids as string[]) ?? [],
    interventionDoses: (row.intervention_doses as TreatmentPlanRecord["interventionDoses"]) ?? undefined,
    goals: (row.goals as TreatmentPlanRecord["goals"]) ?? [],
    boundary: (row.boundary as string) ?? undefined,
    notes: (row.notes as string) ?? undefined,
    createdAt: new Date(typeof crt === "string" ? crt : String(crt)),
    createdBy: (row.created_by as string) ?? null,
    updatedAt: new Date(typeof crt === "string" ? crt : String(crt)),
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
  };
}

export async function findPlansByEncounterDual(encounterId: string): Promise<TreatmentPlanRecord[]> {
  if (!isSupabaseReady()) {
    const all = await treatmentPlanRepository.findAll();
    return all
      .filter((p) => p.encounterId === encounterId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("treatment_plans")
    .select("*")
    .eq("encounter_id", encounterId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`查询治疗计划失败: ${error.message}`);
  return (data ?? []).map(planFromRow);
}

export async function createPlanDual(input: TreatmentPlanInput): Promise<TreatmentPlanRecord> {
  if (!isSupabaseReady()) return treatmentPlanRepository.create(input);
  const supabase = getSupabase()!;
  const id = crypto.randomUUID();
  const createdAt = new Date();

  // patient_id 必填,从 encounter 查
  let patientId = input.patientId;
  if (!patientId && input.encounterId) {
    const { data: enc } = await supabase
      .from("encounters")
      .select("patient_id")
      .eq("id", input.encounterId)
      .maybeSingle();
    if (enc) patientId = enc.patient_id;
  }

  const { data, error } = await supabase.from("treatment_plans").insert(planToRow({ ...input, id, createdAt, patientId })).select().maybeSingle();
  if (error || !data) throw new Error(`保存治疗计划失败: ${error?.message ?? "无响应"}`);
  return planFromRow(data);
}

export async function deletePlanDual(id: string): Promise<void> {
  if (!isSupabaseReady()) return treatmentPlanRepository.remove(id);
  const supabase = getSupabase()!;
  const { error } = await supabase
    .from("treatment_plans")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`删除治疗计划失败: ${error.message}`);
}

/* ---- 疗效复评 ---- */

export function noteToRow(input: ProgressNoteInput & { id: string; createdAt: Date }, actorIdOverride?: string): Record<string, unknown> {
  return {
    id: input.id,
    org_id: input.orgId,
    encounter_id: input.encounterId,
    patient_id: input.patientId,
    horizon: input.horizon,
    subjective: input.subjective,
    objective: input.objective,
    assessment: input.assessment,
    plan: input.plan,
    vas_current: input.vasCurrent ?? null,
    created_at: input.createdAt.toISOString(),
    created_by: actorIdOverride ?? getSession().userId,
  };
}

function noteFromRow(row: Record<string, unknown>): ProgressNoteRecord {
  const crt = row.created_at;
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    encounterId: String(row.encounter_id),
    patientId: String(row.patient_id),
    treatmentPlanId: String(row.encounter_id),  // progress_notes 没有 planId 列,用 encounter_id
    horizon: row.horizon as ProgressNoteRecord["horizon"],
    subjective: (row.subjective as string) ?? "",
    objective: (row.objective as string) ?? "",
    assessment: (row.assessment as string) ?? "",
    plan: (row.plan as string) ?? "",
    vasCurrent: (row.vas_current as number) ?? undefined,
    createdAt: new Date(typeof crt === "string" ? crt : String(crt)),
    createdBy: (row.created_by as string) ?? null,
    updatedAt: new Date(typeof crt === "string" ? crt : String(crt)),
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
  };
}

export async function findNotesByPlanDual(planId: string): Promise<ProgressNoteRecord[]> {
  if (!isSupabaseReady()) {
    const all = await progressNoteRepository.findAll();
    return all
      .filter((n) => n.treatmentPlanId === planId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("progress_notes")
    .select("*")
    .eq("encounter_id", planId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`查询疗效复评失败: ${error.message}`);
  return (data ?? []).map(noteFromRow);
}

export async function createNoteDual(input: ProgressNoteInput): Promise<ProgressNoteRecord> {
  if (!isSupabaseReady()) return progressNoteRepository.create(input);
  const supabase = getSupabase()!;
  const id = crypto.randomUUID();
  const createdAt = new Date();
  const { data, error } = await supabase.from("progress_notes").insert(noteToRow({ ...input, id, createdAt })).select().maybeSingle();
  if (error || !data) throw new Error(`保存疗效复评失败: ${error?.message ?? "无响应"}`);
  return noteFromRow(data);
}

export async function findNotesByEncounterDual(encounterId: string): Promise<ProgressNoteRecord[]> {
  if (!isSupabaseReady()) {
    const all = await progressNoteRepository.findAll();
    return all.filter((n) => n.encounterId === encounterId);
  }
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("progress_notes")
    .select("*")
    .eq("encounter_id", encounterId)
    .is("deleted_at", null);
  if (error) throw new Error(`查询疗效复评失败: ${error.message}`);
  return (data ?? []).map(noteFromRow);
}
