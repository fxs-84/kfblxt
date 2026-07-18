/**
 * 会员系统仓储的 Supabase 双模式分发。
 *
 * 涉及 6 类数据:Rules / Tiers / Memberships / PointsLogs / Redemptions / RewardProducts。
 * Rules / Tiers / RewardProducts 是机构级配置数据,其余 3 类是 patient-scoped。
 * 查询时合并 Supabase 与 localStorage,避免 fallback 数据丢失。
 */

import { getSession } from "../../lib/session";
import { getSupabase } from "../../lib/supabase";
import type {
  PatientMembership,
  PointsLog,
  Redemption,
  RewardProduct,
  PointsRule,
  TierConfig,
} from "./models";
import { BUILTIN_RULES, DEFAULT_TIERS, REWARD_SEED } from "./builtin-rules";
import {
  localFindAllRules,
  localCreateRule,
  localUpdateRule,
  localDeleteRule,
  localFindAllTiers,
  localUpdateTier,
  localGetOrCreateMembership,
  localUpdateMembership,
  localFindAllLogs,
  localAppendLog,
  localGetRecentLogs,
  localGetLogsForRule,
  localMarkMembershipsOrphanedByPatient,
  localMarkLogsOrphanedByPatient,
  localMarkRedemptionsOrphanedByPatient,
  localFindAllRewards,
  localFindRewardById,
  localCreateReward,
  localUpdateReward,
  localDeleteReward,
  localFindAllRedemptions,
  localFindRedemptionsByPatient,
  localCreateRedemption,
  localUpdateRedemption,
} from "./rule.repository";

const LOCAL_PREFIX = "anrm_membership-";

function localKey(name: string): string {
  return `${LOCAL_PREFIX}${name}`;
}

function localLoad<T>(name: string): T[] {
  try {
    const raw = localStorage.getItem(localKey(name));
    if (!raw) return [];
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

function localSave<T>(name: string, data: T[]): void {
  try {
    localStorage.setItem(localKey(name), JSON.stringify(data));
  } catch (e) {
    console.error(`[membership-supabase] local save ${name} failed:`, e);
  }
}

function isSupabaseReady(): boolean {
  return getSupabase() !== null;
}

function orgId(): string {
  return getSession().orgId;
}

function actorId(): string {
  return getSession().userId;
}

function canWriteConfig(): boolean {
  const role = getSession().role;
  return role === "admin" || role === "physician";
}

const seedPromises = new Map<string, Promise<void>>();

export async function ensureSeededDual(): Promise<void> {
  if (!isSupabaseReady()) return;
  if (!canWriteConfig()) return;
  const org = orgId();
  const cached = seedPromises.get(org);
  if (cached) return cached;
  const promise = seedConfigTables()
    .catch((err) => {
      seedPromises.delete(org);
      throw err;
    });
  seedPromises.set(org, promise);
  return promise;
}

async function seedConfigTables(): Promise<void> {
  const supabase = getSupabase()!;
  const currentOrg = orgId();

  const { data: ruleRows, error: ruleErr } = await supabase
    .from("points_rules")
    .select("id")
    .eq("org_id", currentOrg);
  if (ruleErr) throw new Error(`查询积分规则失败: ${ruleErr.message}`);
  const existingRuleIds = new Set((ruleRows ?? []).map((r) => String(r.id)));
  const missingRules = BUILTIN_RULES.filter((r) => !existingRuleIds.has(r.id));
  if (missingRules.length) {
    const { error } = await supabase.from("points_rules").insert(missingRules.map(ruleToRow));
    if (error) throw new Error(`初始化积分规则失败: ${error.message}`);
  }

  const { data: tierRows, error: tierErr } = await supabase
    .from("tier_configs")
    .select("tier")
    .eq("org_id", currentOrg);
  if (tierErr) throw new Error(`查询会员等级失败: ${tierErr.message}`);
  const existingTiers = new Set((tierRows ?? []).map((t) => String(t.tier)));
  const missingTiers = DEFAULT_TIERS.filter((t) => !existingTiers.has(t.tier));
  if (missingTiers.length) {
    const { error } = await supabase.from("tier_configs").insert(missingTiers.map(tierToRow));
    if (error) throw new Error(`初始化会员等级失败: ${error.message}`);
  }

  const { data: rewardRows, error: rewardErr } = await supabase
    .from("reward_products")
    .select("id")
    .eq("org_id", currentOrg);
  if (rewardErr) throw new Error(`查询兑换商品失败: ${rewardErr.message}`);
  // 商品不标记 builtin,与 localStorage 语义保持一致:只在空表时初始化一次,避免用户删除后反复复活
  if ((rewardRows ?? []).length === 0) {
    const { error } = await supabase.from("reward_products").insert(REWARD_SEED.map(rewardToRow));
    if (error) throw new Error(`初始化兑换商品失败: ${error.message}`);
  }
}

/* ---- Membership ---- */

export function membershipToRow(m: PatientMembership, actorIdOverride?: string): Record<string, unknown> {
  return {
    patient_id: m.patientId,
    org_id: orgId(),
    tier: m.tier,
    points: m.points,
    total_earned: m.totalEarned,
    total_spent: m.totalSpent,
    registered_at: m.registeredAt,
    note: m.note ?? null,
    deleted_at: m.deletedAt ?? null,
    deleted_by: m.deletedBy ?? null,
    created_by: actorIdOverride ?? actorId(),
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

export async function findMembershipByPatientDual(patientId: string): Promise<PatientMembership | null> {
  const localRaw = typeof localStorage !== "undefined"
    ? JSON.parse(localStorage.getItem("anrm:membership-memberships") ?? "[]")
    : [];
  const local = (localRaw as PatientMembership[]).filter(
    (m) => m.patientId === patientId && !m.deletedAt,
  )[0] ?? null;
  if (!isSupabaseReady()) return local;
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("patient_memberships")
    .select("*")
    .eq("patient_id", patientId)
    .eq("org_id", orgId())
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`查询客户会员档案失败: ${error.message}`);
  if (!data) return local;
  return membershipFromRow(data);
}

export async function upsertMembershipDual(m: PatientMembership): Promise<PatientMembership> {
  if (!isSupabaseReady()) {
    const key = "anrm:membership-memberships";
    const all = JSON.parse(localStorage.getItem(key) ?? "[]") as PatientMembership[];
    const idx = all.findIndex((x) => x.patientId === m.patientId);
    if (idx >= 0) all[idx] = m;
    else all.push(m);
    localStorage.setItem(key, JSON.stringify(all));
    return m;
  }
  const supabase = getSupabase()!;
  // 不依赖 onConflict(老实例主键可能不匹配),先查存在性再决定 update/insert。
  // 注意:PatientMembership 模型没有 orgId 字段,定位条件必须用 session 的 orgId(),
  // 与 membershipToRow 写入的 org_id 保持一致;用 m.orgId 会是 undefined,
  // 导致存在性查询永远落空 → 已存在时误走 INSERT → 主键冲突,积分永远写不进。
  const org = orgId();
  const { data: existing } = await supabase
    .from("patient_memberships")
    .select("org_id, patient_id")
    .eq("org_id", org)
    .eq("patient_id", m.patientId)
    .maybeSingle();
  let data: Record<string, unknown> | null = null;
  let error: { message: string } | null = null;
  if (existing) {
    const res = await supabase
      .from("patient_memberships")
      .update(membershipToRow(m))
      .eq("org_id", org)
      .eq("patient_id", m.patientId)
      .select()
      .maybeSingle();
    data = res.data;
    error = res.error;
  } else {
    const res = await supabase
      .from("patient_memberships")
      .insert(membershipToRow(m))
      .select()
      .maybeSingle();
    data = res.data;
    error = res.error;
  }
  if (error || !data) throw new Error(`保存客户会员档案失败: ${error?.message ?? "无响应"}`);
  return membershipFromRow(data);
}

export async function getOrCreateMembershipDual(patientId: string): Promise<PatientMembership> {
  if (!isSupabaseReady()) {
    return localGetOrCreateMembership(patientId);
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

export function logToRow(l: PointsLog, actorIdOverride?: string): Record<string, unknown> {
  return {
    id: l.id,
    org_id: orgId(),
    patient_id: l.patientId,
    delta: l.delta,
    balance_after: l.balanceAfter,
    reason: l.reason,
    rule_id: l.ruleId ?? null,
    trigger_type: l.triggerType ?? null,
    ref_type: l.refType ?? null,
    ref_id: l.refId ?? null,
    operator_id: actorIdOverride ?? actorId(),
    created_at: l.createdAt,
    deleted_at: l.deletedAt ?? null,
    created_by: actorIdOverride ?? actorId(),
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

export async function appendLogDual(log: PointsLog): Promise<PointsLog> {
  if (!isSupabaseReady()) {
    return localAppendLog(log);
  }
  const supabase = getSupabase()!;
  const row = logToRow(log);
  // eslint-disable-next-line no-console
  console.log("[appendLogDual] row=", row);
  const { data, error } = await supabase.from("points_logs").insert(row).select().maybeSingle();
  if (error || !data) throw new Error(`保存积分流水失败: ${error?.message ?? "无响应"}`);
  return logFromRow(data);
}

export async function getRecentLogsDual(patientId: string, limit = 20): Promise<PointsLog[]> {
  const local = localGetRecentLogs(patientId, limit);
  if (!isSupabaseReady()) return local;
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("points_logs")
    .select("*")
    .eq("patient_id", patientId)
    .eq("org_id", orgId())
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`查询积分流水失败: ${error.message}`);
  const remote = (data ?? []).map(logFromRow);
  const merged = new Map<string, PointsLog>();
  for (const r of remote) merged.set(r.id, r);
  for (const l of local) if (!merged.has(l.id)) merged.set(l.id, l);
  return [...merged.values()]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

/* ---- Redemptions ---- */

export function redemptionToRow(r: Redemption, actorIdOverride?: string): Record<string, unknown> {
  return {
    id: r.id,
    org_id: orgId(),
    patient_id: r.patientId,
    reward_id: r.rewardId,
    reward_name: r.rewardName,
    points_cost: r.pointsCost,
    status: r.status,
    notes: r.notes ?? null,
    operator_id: actorIdOverride ?? actorId(),
    created_at: r.createdAt,
    fulfilled_at: r.fulfilledAt ?? null,
    cancelled_at: r.cancelledAt ?? null,
    deleted_at: r.deletedAt ?? null,
    created_by: actorIdOverride ?? actorId(),
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

export async function findRedemptionsByPatientDual(patientId: string): Promise<Redemption[]> {
  const local = localFindRedemptionsByPatient(patientId);
  if (!isSupabaseReady()) return local;
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("redemptions")
    .select("*")
    .eq("patient_id", patientId)
    .eq("org_id", orgId())
    .is("deleted_at", null);
  if (error) throw new Error(`查询兑换订单失败: ${error.message}`);
  const remote = (data ?? []).map(redemptionFromRow);
  const merged = new Map<string, Redemption>();
  for (const r of remote) merged.set(r.id, r);
  for (const l of local) if (!merged.has(l.id)) merged.set(l.id, l);
  return [...merged.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function findAllRedemptionsDual(): Promise<Redemption[]> {
  const local = localFindAllRedemptions();
  if (!isSupabaseReady()) return local;
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("redemptions")
    .select("*")
    .eq("org_id", orgId())
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`查询兑换订单失败: ${error.message}`);
  const remote = (data ?? []).map(redemptionFromRow);
  const merged = new Map<string, Redemption>();
  for (const r of remote) merged.set(r.id, r);
  for (const l of local) if (!merged.has(l.id)) merged.set(l.id, l);
  return [...merged.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function createRedemptionDual(r: Redemption): Promise<Redemption> {
  if (!isSupabaseReady()) {
    return localCreateRedemption(r);
  }
  const supabase = getSupabase()!;
  const { data, error } = await supabase.from("redemptions").insert(redemptionToRow(r)).select().maybeSingle();
  if (error || !data) throw new Error(`创建兑换订单失败: ${error?.message ?? "无响应"}`);
  return redemptionFromRow(data);
}

export async function updateRedemptionDual(id: string, patch: Partial<Redemption>): Promise<Redemption | null> {
  if (!isSupabaseReady()) {
    return localUpdateRedemption(id, patch);
  }
  const supabase = getSupabase()!;
  const row: Record<string, unknown> = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.fulfilledAt !== undefined) row.fulfilled_at = patch.fulfilledAt;
  if (patch.cancelledAt !== undefined) row.cancelled_at = patch.cancelledAt;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.deletedAt !== undefined) row.deleted_at = patch.deletedAt;
  const { data, error } = await supabase.from("redemptions").update(row).eq("id", id).eq("org_id", orgId()).select().maybeSingle();
  if (error || !data) return null;
  return redemptionFromRow(data);
}

/* ---- Reward Products ---- */

function rewardToRow(r: RewardProduct): Record<string, unknown> {
  return {
    id: r.id,
    org_id: orgId(),
    name: r.name,
    description: r.description,
    category: r.category,
    points_cost: r.pointsCost,
    image_emoji: r.imageEmoji,
    stock: r.stock,
    tier_required: r.tierRequired ?? null,
    enabled: r.enabled,
    created_by: actorId(),
  };
}

function rewardFromRow(row: Record<string, unknown>): RewardProduct {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ""),
    category: row.category as RewardProduct["category"],
    pointsCost: Number(row.points_cost),
    imageEmoji: String(row.image_emoji ?? "🎁"),
    stock: Number(row.stock),
    tierRequired: (row.tier_required as string | null) ?? null,
    enabled: Boolean(row.enabled),
    createdAt: String(row.created_at),
  };
}

export async function findAllRewardsDual(): Promise<RewardProduct[]> {
  const local = localFindAllRewards();
  if (!isSupabaseReady()) return local;
  await ensureSeededDual();
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("reward_products")
    .select("*")
    .eq("org_id", orgId())
    .order("created_at", { ascending: false });
  if (error) throw new Error(`查询兑换商品失败: ${error.message}`);
  const remote = (data ?? []).map(rewardFromRow);
  const merged = new Map<string, RewardProduct>();
  for (const r of remote) merged.set(r.id, r);
  for (const l of local) if (!merged.has(l.id)) merged.set(l.id, l);
  return [...merged.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function findRewardByIdDual(id: string): Promise<RewardProduct | null> {
  const all = await findAllRewardsDual();
  return all.find((r) => r.id === id) ?? null;
}

export async function createRewardDual(r: RewardProduct): Promise<RewardProduct> {
  if (!isSupabaseReady()) {
    return localCreateReward(r);
  }
  const supabase = getSupabase()!;
  const { data, error } = await supabase.from("reward_products").insert(rewardToRow(r)).select().maybeSingle();
  if (error || !data) throw new Error(`创建兑换商品失败: ${error?.message ?? "无响应"}`);
  return rewardFromRow(data);
}

export async function updateRewardDual(id: string, patch: Partial<RewardProduct>): Promise<RewardProduct | null> {
  if (!isSupabaseReady()) {
    return localUpdateReward(id, patch);
  }
  const supabase = getSupabase()!;
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.pointsCost !== undefined) row.points_cost = patch.pointsCost;
  if (patch.imageEmoji !== undefined) row.image_emoji = patch.imageEmoji;
  if (patch.stock !== undefined) row.stock = patch.stock;
  if (patch.tierRequired !== undefined) row.tier_required = patch.tierRequired;
  if (patch.enabled !== undefined) row.enabled = patch.enabled;
  const { data, error } = await supabase.from("reward_products").update(row).eq("id", id).eq("org_id", orgId()).select().maybeSingle();
  if (error || !data) return null;
  return rewardFromRow(data);
}

export async function deleteRewardDual(id: string): Promise<void> {
  if (!isSupabaseReady()) {
    return localDeleteReward(id);
  }
  const supabase = getSupabase()!;
  const { error } = await supabase.from("reward_products").delete().eq("id", id).eq("org_id", orgId());
  if (error) throw new Error(`删除兑换商品失败: ${error.message}`);
}

/* ---- Points Rules ---- */

function ruleToRow(r: PointsRule): Record<string, unknown> {
  return {
    id: r.id,
    org_id: orgId(),
    name: r.name,
    enabled: r.enabled,
    builtin: r.builtin,
    trigger: r.trigger,
    conditions: r.conditions,
    action: r.action,
    cooldown_days: r.cooldownDays,
    max_per_patient: r.maxPerPatient,
    priority: r.priority,
    order_index: r.order,
    valid_from: r.validFrom,
    valid_until: r.validUntil,
    created_by: actorId(),
  };
}

function ruleFromRow(row: Record<string, unknown>): PointsRule {
  return {
    id: String(row.id),
    name: String(row.name),
    enabled: Boolean(row.enabled),
    builtin: Boolean(row.builtin),
    trigger: row.trigger as PointsRule["trigger"],
    conditions: (row.conditions ?? []) as PointsRule["conditions"],
    action: (row.action ?? {}) as PointsRule["action"],
    cooldownDays: Number(row.cooldown_days ?? 0),
    maxPerPatient: Number(row.max_per_patient ?? 0),
    priority: Number(row.priority ?? 0),
    order: Number(row.order_index ?? 0),
    validFrom: (row.valid_from as string | null) ?? null,
    validUntil: (row.valid_until as string | null) ?? null,
  };
}

export async function findAllRulesDual(): Promise<PointsRule[]> {
  const local = localFindAllRules();
  if (!isSupabaseReady()) return local;
  await ensureSeededDual();
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("points_rules")
    .select("*")
    .eq("org_id", orgId())
    .order("order_index", { ascending: true });
  if (error) throw new Error(`查询积分规则失败: ${error.message}`);
  const remote = (data ?? []).map(ruleFromRow);
  const merged = new Map<string, PointsRule>();
  for (const r of remote) merged.set(r.id, r);
  for (const l of local) if (!merged.has(l.id)) merged.set(l.id, l);
  return [...merged.values()].sort((a, b) => a.order - b.order);
}

export async function findRuleByIdDual(id: string): Promise<PointsRule | null> {
  const all = await findAllRulesDual();
  return all.find((r) => r.id === id) ?? null;
}

export async function createRuleDual(rule: PointsRule): Promise<PointsRule> {
  if (!isSupabaseReady()) {
    return localCreateRule(rule);
  }
  const supabase = getSupabase()!;
  const { data, error } = await supabase.from("points_rules").insert(ruleToRow(rule)).select().maybeSingle();
  if (error || !data) throw new Error(`创建积分规则失败: ${error?.message ?? "无响应"}`);
  return ruleFromRow(data);
}

export async function updateRuleDual(id: string, patch: Partial<PointsRule>): Promise<PointsRule | null> {
  if (!isSupabaseReady()) {
    return localUpdateRule(id, patch);
  }
  const supabase = getSupabase()!;
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.enabled !== undefined) row.enabled = patch.enabled;
  if (patch.trigger !== undefined) row.trigger = patch.trigger;
  if (patch.conditions !== undefined) row.conditions = patch.conditions;
  if (patch.action !== undefined) row.action = patch.action;
  if (patch.cooldownDays !== undefined) row.cooldown_days = patch.cooldownDays;
  if (patch.maxPerPatient !== undefined) row.max_per_patient = patch.maxPerPatient;
  if (patch.priority !== undefined) row.priority = patch.priority;
  if (patch.order !== undefined) row.order_index = patch.order;
  if (patch.validFrom !== undefined) row.valid_from = patch.validFrom;
  if (patch.validUntil !== undefined) row.valid_until = patch.validUntil;
  const { data, error } = await supabase.from("points_rules").update(row).eq("id", id).eq("org_id", orgId()).select().maybeSingle();
  if (error || !data) return null;
  return ruleFromRow(data);
}

export async function deleteRuleDual(id: string): Promise<void> {
  if (!isSupabaseReady()) {
    return localDeleteRule(id);
  }
  const supabase = getSupabase()!;
  const { error } = await supabase.from("points_rules").delete().eq("id", id).eq("org_id", orgId());
  if (error) throw new Error(`删除积分规则失败: ${error.message}`);
}

/* ---- Tier Configs ---- */

function tierToRow(t: TierConfig): Record<string, unknown> {
  return {
    tier: t.tier,
    org_id: orgId(),
    name: t.name,
    color: t.color,
    icon: t.icon,
    min_total_spent: t.minTotalSpent,
    point_multiplier: t.pointMultiplier,
    discount_on_redeem: t.discountOnRedeem,
    created_by: actorId(),
  };
}

function tierFromRow(row: Record<string, unknown>): TierConfig {
  return {
    tier: row.tier as TierConfig["tier"],
    name: String(row.name),
    color: String(row.color),
    icon: String(row.icon),
    minTotalSpent: Number(row.min_total_spent),
    pointMultiplier: Number(row.point_multiplier),
    discountOnRedeem: Number(row.discount_on_redeem),
  };
}

export async function findAllTiersDual(): Promise<TierConfig[]> {
  const local = localFindAllTiers();
  if (!isSupabaseReady()) return local;
  await ensureSeededDual();
  const supabase = getSupabase()!;
  const { data, error } = await supabase.from("tier_configs").select("*").eq("org_id", orgId());
  if (error) throw new Error(`查询会员等级失败: ${error.message}`);
  const remote = (data ?? []).map(tierFromRow);
  const merged = new Map<string, TierConfig>();
  for (const r of remote) merged.set(r.tier, r);
  for (const l of local) if (!merged.has(l.tier)) merged.set(l.tier, l);
  return [...merged.values()];
}

export async function updateTierDual(tier: TierConfig["tier"], patch: Partial<TierConfig>): Promise<TierConfig | null> {
  if (!isSupabaseReady()) {
    return localUpdateTier(tier, patch);
  }
  const supabase = getSupabase()!;
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.color !== undefined) row.color = patch.color;
  if (patch.icon !== undefined) row.icon = patch.icon;
  if (patch.minTotalSpent !== undefined) row.min_total_spent = patch.minTotalSpent;
  if (patch.pointMultiplier !== undefined) row.point_multiplier = patch.pointMultiplier;
  if (patch.discountOnRedeem !== undefined) row.discount_on_redeem = patch.discountOnRedeem;
  const { data, error } = await supabase.from("tier_configs").update(row).eq("tier", tier).eq("org_id", orgId()).select().maybeSingle();
  if (error || !data) return null;
  return tierFromRow(data);
}

/* ---- 客户删除级联标记 ---- */

export async function markMembershipsOrphanedByPatientDual(patientId: string): Promise<number> {
  if (!isSupabaseReady()) {
    return localMarkMembershipsOrphanedByPatient(patientId);
  }
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("patient_memberships")
    .update({ deleted_at: new Date().toISOString() })
    .eq("patient_id", patientId)
    .eq("org_id", orgId())
    .is("deleted_at", null)
    .select("patient_id");
  if (error) throw new Error(`级联标记 membership 失败: ${error.message}`);
  return data?.length ?? 0;
}

export async function markLogsOrphanedByPatientDual(patientId: string): Promise<number> {
  if (!isSupabaseReady()) {
    return localMarkLogsOrphanedByPatient(patientId);
  }
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("points_logs")
    .update({ deleted_at: new Date().toISOString() })
    .eq("patient_id", patientId)
    .eq("org_id", orgId())
    .is("deleted_at", null)
    .select("id");
  if (error) throw new Error(`级联标记 logs 失败: ${error.message}`);
  return data?.length ?? 0;
}

export async function markRedemptionsOrphanedByPatientDual(patientId: string): Promise<number> {
  if (!isSupabaseReady()) {
    return localMarkRedemptionsOrphanedByPatient(patientId);
  }
  const supabase = getSupabase()!;
  const { data, error } = await supabase
    .from("redemptions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("patient_id", patientId)
    .eq("org_id", orgId())
    .is("deleted_at", null)
    .select("id");
  if (error) throw new Error(`级联标记 redemptions 失败: ${error.message}`);
  return data?.length ?? 0;
}
