/**
 * 计费(充值/消费/退费)仓储的 Supabase 双模式分发。
 * 表名: billing_records(已在 0002 迁移)。
 */

import { getSupabase } from "../../lib/supabase";
import {
  billingRepository,
  calcBalance,
  type BillingRecordEntity,
  type BillingInput,
} from "./billing.repository";

function isSupabaseReady(): boolean {
  return getSupabase() !== null;
}

function toRow(input: BillingInput & { id: string; createdAt: Date }): Record<string, unknown> {
  return {
    id: input.id,
    org_id: input.orgId,
    patient_id: input.patientId,
    type: input.type || null,
    amount: input.amount,
    sessions: input.sessions ?? null,
    note: input.note,
    encounter_id: input.encounterId ?? null,
    created_at: input.createdAt.toISOString(),
    created_by: null,
  };
}

function fromRow(row: Record<string, unknown>): BillingRecordEntity {
  const crt = row.created_at;
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    patientId: String(row.patient_id),
    type: row.type as BillingRecordEntity["type"],
    amount: Number(row.amount),
    sessions: row.sessions != null ? Number(row.sessions) : undefined,
    note: String(row.note ?? ""),
    encounterId: (row.encounter_id as string) ?? undefined,
    createdAt: new Date(typeof crt === "string" ? crt : String(crt)),
    createdBy: (row.created_by as string) ?? null,
    updatedAt: new Date(typeof crt === "string" ? crt : String(crt)),
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
  };
}

export async function findBillingByPatientDual(patientId: string): Promise<BillingRecordEntity[]> {
  if (!isSupabaseReady()) {
    const all = await billingRepository.findAll();
    return all
      .filter((b) => b.patientId === patientId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("billing_records")
    .select("*")
    .eq("patient_id", patientId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`查询账单失败: ${error.message}`);
  return (data ?? []).map(fromRow);
}

export async function findBillingByEncounterDual(encounterId: string): Promise<BillingRecordEntity[]> {
  if (!isSupabaseReady()) {
    const all = await billingRepository.findAll();
    return all
      .filter((b) => b.encounterId === encounterId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("billing_records")
    .select("*")
    .eq("encounter_id", encounterId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`查询账单失败: ${error.message}`);
  return (data ?? []).map(fromRow);
}

export async function createBillingDual(input: BillingInput): Promise<BillingRecordEntity> {
  if (!isSupabaseReady()) return billingRepository.create(input);
  const supabase = getSupabase()!;
  const id = crypto.randomUUID();
  const createdAt = new Date();
  const { data, error } = await supabase.from("billing_records").insert(toRow({ ...input, id, createdAt })).select().maybeSingle();
  if (error || !data) throw new Error(`保存账单失败: ${error?.message ?? "无响应"}`);
  return fromRow(data);
}

export async function deleteBillingDual(id: string): Promise<void> {
  if (!isSupabaseReady()) return billingRepository.remove(id);
  const supabase = getSupabase()!;
  const { error } = await supabase
    .from("billing_records")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`删除账单失败: ${error.message}`);
}

/** 与原 localStorage 仓库同形语义,提供 calcBalance 透传 */
export { calcBalance };
