/**
 * 查体会话仓储的 Supabase 双模式分发。
 * - encounters 字段映射:Record<string, ExamResult> ↔ jsonb 列
 */

import { getSupabase } from "../../lib/supabase";
import { examSessionRepository } from "./exam.repository";
import type { ExamSessionRecord, ExamSessionInput } from "./exam.repository";

function isSupabaseReady(): boolean {
  return getSupabase() !== null;
}

function toRow(input: ExamSessionInput & { id: string; createdAt: Date }): Record<string, unknown> {
  return {
    id: input.id,
    org_id: input.orgId,
    encounter_id: input.encounterId,
    patient_id: input.patientId,
    items: input.results,
    created_at: input.createdAt.toISOString(),
    created_by: null,
  };
}

function fromRow(row: Record<string, unknown>): ExamSessionRecord {
  const crt = row.created_at;
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    encounterId: String(row.encounter_id),
    patientId: String(row.patient_id),
    results: (row.items ?? {}) as ExamSessionRecord["results"],
    createdAt: new Date(typeof crt === "string" ? crt : String(crt)),
    createdBy: (row.created_by as string) ?? null,
    updatedAt: new Date(typeof crt === "string" ? crt : String(crt)),
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
  };
}

export async function findSessionsByEncounterDual(encounterId: string): Promise<ExamSessionRecord[]> {
  if (!isSupabaseReady()) {
    const all = await examSessionRepository.findAll();
    return all
      .filter((s) => s.encounterId === encounterId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("exam_sessions")
    .select("*")
    .eq("encounter_id", encounterId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`查询查体失败: ${error.message}`);
  return (data ?? []).map(fromRow);
}

export async function findLatestSessionDual(encounterId: string): Promise<ExamSessionRecord | null> {
  const list = await findSessionsByEncounterDual(encounterId);
  return list[0] ?? null;
}

export async function createExamSessionDual(input: ExamSessionInput): Promise<ExamSessionRecord> {
  if (!isSupabaseReady()) return examSessionRepository.create(input);
  const supabase = getSupabase()!;
  const id = crypto.randomUUID();
  const createdAt = new Date();

  // patient_id 必填但调用方可能没传,从 encounter 查
  let patientId = input.patientId;
  if (!patientId && input.encounterId) {
    const { data: enc } = await supabase
      .from("encounters")
      .select("patient_id")
      .eq("id", input.encounterId)
      .maybeSingle();
    if (enc) patientId = enc.patient_id;
  }

  const TIMEOUT_MS = 15_000;
  const insert = supabase
    .from("exam_sessions")
    .insert(toRow({ ...input, id, createdAt, patientId }))
    .select()
    .maybeSingle();

  const result = await Promise.race([
    insert.then((r) => ({ ...r, timedOut: false as const })),
    new Promise<{ timedOut: true }>((resolve) => setTimeout(() => resolve({ timedOut: true }), TIMEOUT_MS)),
  ]);

  if (result.timedOut) {
    console.warn("[exam] Supabase insert timed out, fallback to localStorage");
    return examSessionRepository.create({ ...input, orgId: input.orgId });
  }

  const { data, error } = result as NonNullable<typeof result>;
  if (error) {
    // 真实错误(非超时),抛出让 UI 显示
    throw new Error(`保存查体失败: ${error.message}`);
  }
  if (!data) {
    // 无返回数据也落回 localStorage
    console.warn("[exam] Supabase insert returned no data, fallback to localStorage");
    return examSessionRepository.create({ ...input, orgId: input.orgId });
  }
  return fromRow(data);
}

export async function deleteExamSessionDual(id: string): Promise<void> {
  if (!isSupabaseReady()) return examSessionRepository.remove(id);
  const supabase = getSupabase()!;
  const { error } = await supabase
    .from("exam_sessions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`删除查体失败: ${error.message}`);
}
