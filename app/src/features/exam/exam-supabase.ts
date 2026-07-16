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

  // 加 15 秒超时:网络慢或数据大时不卡 UI
  const TIMEOUT_MS = 15_000;
  const insert = supabase
    .from("exam_sessions")
    .insert(toRow({ ...input, id, createdAt }))
    .select()
    .maybeSingle();

  const raced = await Promise.race([
    insert,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("超时")), TIMEOUT_MS)),
  ]);

  const { data, error } = raced as Awaited<typeof insert>;
  if (error || !data) {
    // Supabase 失败(含超时)→落回 localStorage
    console.warn("[exam] Supabase insert failed, fallback to localStorage:", error?.message);
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
