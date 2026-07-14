/**
 * 会员系统仓储的 Supabase 双模式分发。
 *
 * 涉及 5 类数据:Rules / Tiers / Memberships / PointsLogs / Redemptions。
 * 规则 / 等级是机构级配置数据(同机构共用),其余 3 类是 patient-scoped。
 *
 * 当前阶段优先覆盖:客户档案、积分流水、兑换订单(实际患者数据)。
 * Rules / Tiers 在多机构模式下需用 RLS 限定 org;此处先保留 localStorage
 * 作为单机管理入口,后续可加 supabase 派生。
 */

import { getSupabase } from "../../lib/supabase";
import type {
  PatientMembership,
  PointsLog,
  Redemption,
} from "./models";

function isSupabaseReady(): boolean {
  return getSupabase() !== null;
}

function membershipToRow(m: PatientMembership): Record<string, unknown> {
  return {
    patient_id: m.patientId,
    tier: m.tier,
    points: m.points,
    total_earned: m.totalEarned,
    total_spent: m.totalSpent,
    registered_at: m.registeredAt,
    note: m.note ?? null,
    deleted_at: m.deletedAt ?? null,
    deleted_by: m.deletedBy ?? null,
  };
}

function membershipFromRow(row: Record<string, unknown>): PatientMembership {
  return {
    patientId: String(row.patient_id),
    tier: row.tier as PatientMembership["tier"],
    points: Number(row.points),
    totalEarned: Number(row.total_earned),
    totalSpent: Number(row.total_spent),
    registeredAt: String(row.registered_at),
    note: (row.note as string | null) ?? null,
    deletedAt: (row.deleted_at as string | null) ?? null,
    deletedBy: (row.deleted_by as string | null) ?? null,
  };
}

function logToRow(l: PointsLog): Record<string, unknown> {
  return {
    id: l.id,
    patient_id: l.patientId,
    delta: l.delta,
    balance_after: l.balanceAfter,
    reason: l.reason,
    rule_id: l.ruleId ?? null,
    trigger_type: l.triggerType ?? null,
    ref_type: l.refType ?? null,
    ref_id: l.refId ?? null,
    operator_id: l.operatorId,
    created_at: l.createdAt,
    deleted_at: l.deletedAt ?? null,
  };
}

function logFromRow(row: Record<string, unknown>): PointsLog {
  return {
    id: String(row.id),
    patientId: String(row.patient_id),
    delta: Number(row.delta),
    balanceAfter: Number(row.balance_after),
    reason: String(row.reason ?? ""),
    ruleId: (row.rule_id as string | null) ?? null,
    triggerType: (row.trigger_type as PointsLog["triggerType"]) ?? null,
    refType: (row.ref_type as PointsLog["refType"]) ?? null,
    refId: (row.ref_id as string | null) ?? null,
    operatorId: String(row.operator_id ?? ""),
    createdAt: String(row.created_at),
    deletedAt: (row.deleted_at as string | null) ?? null,
  };
}

function redemptionToRow(r: Redemption): Record<string, unknown> {
  return {
    id: r.id,
    patient_id: r.patientId,
    reward_id: r.rewardId,
    reward_name: r.rewardName,
    points_cost: r.pointsCost,
    status: r.status,
    notes: r.notes ?? null,
    operator_id: r.operatorId,
    created_at: r.createdAt,
    fulfilled_at: r.fulfilledAt ?? null,
    cancelled_at: r.cancelledAt ?? null,
    deleted_at: r.deletedAt ?? null,
  };
}

function redemptionFromRow(row: Record<string, unknown>): Redemption {
  return {
    id: String(row.id),
    patientId: String(row.patient_id),
    rewardId: String(row.reward_id),
    rewardName: String(row.reward_name),
    pointsCost: Number(row.points_cost),
    status: row.status as Redemption["status"],
    notes: (row.notes as string | null) ?? null,
    operatorId: String(row.operator_id ?? ""),
    createdAt: String(row.created_at),
    fulfilledAt: (row.fulfilled_at as string | null) ?? null,
    cancelledAt: (row.cancelled_at as string | null) ?? null,
    deletedAt: (row.deleted_at as string | null) ?? null,
  };
}

/* ---- Membership ---- */

export async function findMembershipByPatientDual(patientId: string): Promise<PatientMembership | null> {
  if (!isSupabaseReady()) {
    const allRaw = (typeof localStorage !== "undefined"
      ? JSON.parse(localStorage.getItem("anrm:membership-memberships") ?? "[]")
      : []) as PatientMembership[];
    const found = allRaw.filter((m) => m.patientId === patientId && !m.deletedAt);
    return found[0] ?? null;
  }
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("patient_memberships")
    .select("*")
    .eq("patient_id", patientId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return membershipFromRow(data);
}

export async function upsertMembershipDual(m: PatientMembership): Promise<PatientMembership> {
  if (!isSupabaseReady()) {
    // 落回 localStorage 原存储路径(membership.repository 私有函数不导出,直接复制到同样 key)
    const key = "anrm:membership-memberships";
    const all = JSON.parse(localStorage.getItem(key) ?? "[]") as PatientMembership[];
    const idx = all.findIndex((x) => x.patientId === m.patientId);
    if (idx >= 0) all[idx] = m; else all.push(m);
    localStorage.setItem(key, JSON.stringify(all));
    return m;
  }
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("patient_memberships")
    .upsert(membershipToRow(m), { onConflict: "patient_id" })
    .select()
    .maybeSingle();
  if (error || !data) throw new Error(`保存客户会员档案失败: ${error?.message ?? "无响应"}`);
  return membershipFromRow(data);
}

export async function getOrCreateMembershipDual(patientId: string): Promise<PatientMembership> {
  if (!isSupabaseReady()) {
    // 落到原函数
    const { getOrCreateMembership } = await import("./rule.repository");
    return getOrCreateMembership(patientId);
  }
  const found = await findMembershipByPatientDual(patientId);
  if (found) return found;
  const fresh: PatientMembership = {
    patientId,
    tier: "regular",
    points: 0,
    totalEarned: 0,
    totalSpent: 0,
    registeredAt: new Date().toISOString(),
    note: null,
  };
  return upsertMembershipDual(fresh);
}

/* ---- Points Logs ---- */

export async function appendLogDual(log: PointsLog): Promise<PointsLog> {
  if (!isSupabaseReady()) {
    const { appendLog } = await import("./rule.repository");
    return appendLog(log);
  }
  const supabase = getSupabase()!;
  const { data, error } = await supabase.from("points_logs").insert(logToRow(log)).select().maybeSingle();
  if (error || !data) throw new Error(`保存积分流水失败: ${error?.message ?? "无响应"}`);
  return logFromRow(data);
}

export async function getRecentLogsDual(patientId: string, limit = 20): Promise<PointsLog[]> {
  if (!isSupabaseReady()) {
    const { getRecentLogs } = await import("./rule.repository");
    return getRecentLogs(patientId, limit);
  }
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("points_logs")
    .select("*")
    .eq("patient_id", patientId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`查询积分流水失败: ${error.message}`);
  return (data ?? []).map(logFromRow);
}

/* ---- Redemptions ---- */

export async function findRedemptionsByPatientDual(patientId: string): Promise<Redemption[]> {
  if (!isSupabaseReady()) {
    const { findRedemptionsByPatient } = await import("./rule.repository");
    return findRedemptionsByPatient(patientId);
  }
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("redemptions")
    .select("*")
    .eq("patient_id", patientId)
    .is("deleted_at", null);
  if (error) throw new Error(`查询兑换订单失败: ${error.message}`);
  return (data ?? []).map(redemptionFromRow);
}

export async function createRedemptionDual(r: Redemption): Promise<Redemption> {
  if (!isSupabaseReady()) {
    const { createRedemption } = await import("./rule.repository");
    return createRedemption(r);
  }
  const supabase = getSupabase()!;
  const { data, error } = await supabase.from("redemptions").insert(redemptionToRow(r)).select().maybeSingle();
  if (error || !data) throw new Error(`创建兑换订单失败: ${error?.message ?? "无响应"}`);
  return redemptionFromRow(data);
}

export async function updateRedemptionDual(id: string, patch: Partial<Redemption>): Promise<Redemption | null> {
  if (!isSupabaseReady()) {
    const { updateRedemption } = await import("./rule.repository");
    return updateRedemption(id, patch);
  }
  const supabase = getSupabase()!;
  const row: Record<string, unknown> = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.fulfilledAt !== undefined) row.fulfilled_at = patch.fulfilledAt;
  if (patch.cancelledAt !== undefined) row.cancelled_at = patch.cancelledAt;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.deletedAt !== undefined) row.deleted_at = patch.deletedAt;
  const { data, error } = await supabase.from("redemptions").update(row).eq("id", id).select().maybeSingle();
  if (error || !data) return null;
  return redemptionFromRow(data);
}

/* ---- 客户删除级联标记 ---- */

export async function markMembershipsOrphanedByPatientDual(patientId: string): Promise<number> {
  if (!isSupabaseReady()) {
    const { markMembershipsOrphanedByPatient } = await import("./rule.repository");
    return markMembershipsOrphanedByPatient(patientId);
  }
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("patient_memberships")
    .update({ deleted_at: new Date().toISOString() })
    .eq("patient_id", patientId)
    .is("deleted_at", null)
    .select("patient_id");
  if (error) throw new Error(`级联标记 membership 失败: ${error.message}`);
  return data?.length ?? 0;
}

export async function markLogsOrphanedByPatientDual(patientId: string): Promise<number> {
  if (!isSupabaseReady()) {
    const { markLogsOrphanedByPatient } = await import("./rule.repository");
    return markLogsOrphanedByPatient(patientId);
  }
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("points_logs")
    .update({ deleted_at: new Date().toISOString() })
    .eq("patient_id", patientId)
    .is("deleted_at", null)
    .select("id");
  if (error) throw new Error(`级联标记 logs 失败: ${error.message}`);
  return data?.length ?? 0;
}

export async function markRedemptionsOrphanedByPatientDual(patientId: string): Promise<number> {
  if (!isSupabaseReady()) {
    const { markRedemptionsOrphanedByPatient } = await import("./rule.repository");
    return markRedemptionsOrphanedByPatient(patientId);
  }
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("redemptions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("patient_id", patientId)
    .is("deleted_at", null)
    .select("id");
  if (error) throw new Error(`级联标记 redemptions 失败: ${error.message}`);
  return data?.length ?? 0;
}
