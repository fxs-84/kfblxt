/**
 * 规则 + 等级 + 客户会员档案 + 积分流水 + 兑换商品 + 兑换订单
 * 统一 dual 分发层:Supabase ready 时走云端,否则落回 localStorage。
 */
import { getSession } from "../../lib/session";
import { getSupabase } from "../../lib/supabase";
import { BUILTIN_RULES, DEFAULT_TIERS, REWARD_SEED } from "./builtin-rules";
import {
  ruleSchema,
  tierConfigSchema,
  patientMembershipSchema,
  pointsLogSchema,
  rewardProductSchema,
  redemptionSchema,
  type PointsRule,
  type TierConfig,
  type PatientMembership,
  type PointsLog,
  type RewardProduct,
  type Redemption,
} from "./models";

const PREFIX = "anrm_";

function storageKey(name: string): string {
  return `${PREFIX}membership-${name}`;
}

function load<T>(name: string): T[] {
  try {
    const raw = localStorage.getItem(storageKey(name));
    if (!raw) return [];
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

function save<T>(name: string, data: T[]): void {
  try {
    localStorage.setItem(storageKey(name), JSON.stringify(data));
  } catch (e) {
    console.error(`[membership] save ${name} failed:`, e);
  }
}

function ensureSeeded(name: string, seed: unknown[]): void {
  if (load(name).length === 0) { save(name, seed); return; }
  if (name === "rules" && seed.length > load<any>("rules").length) {
    const existing = load<any>("rules");
    const existingIds = new Set(existing.map(r => r.id));
    for (const s of seed) {
      if (!existingIds.has((s as any).id)) existing.push(s);
    }
    save("rules", existing);
  }
}

function isSupabaseReady(): boolean {
  return getSupabase() !== null;
}

async function dual<T>(supabaseFn: () => Promise<T>, localFn: () => Promise<T> | T): Promise<T> {
  if (!isSupabaseReady()) {
    const r = localFn();
    return r instanceof Promise ? r : Promise.resolve(r);
  }
  return supabaseFn();
}

/** ===== 规则 ===== */
ensureSeeded("rules", BUILTIN_RULES);
ensureSeeded("tiers", DEFAULT_TIERS);

export function localFindAllRules(): PointsRule[] {
  return load<PointsRule>("rules");
}

function localFindRuleById(id: string): PointsRule | null {
  return load<PointsRule>("rules").find(r => r.id === id) ?? null;
}

export function localCreateRule(rule: PointsRule): PointsRule {
  ruleSchema.parse(rule);
  const all = load<PointsRule>("rules");
  all.push(rule);
  save("rules", all);
  return rule;
}

export function localUpdateRule(id: string, patch: Partial<PointsRule>): PointsRule | null {
  const all = load<PointsRule>("rules");
  const idx = all.findIndex(r => r.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch };
  save("rules", all);
  return all[idx];
}

export function localDeleteRule(id: string): void {
  save("rules", load<PointsRule>("rules").filter(r => r.id !== id));
}

export async function findAllRules(): Promise<PointsRule[]> {
  return dual(
    async () => (await import("./membership-supabase")).findAllRulesDual(),
    localFindAllRules,
  );
}

export async function findRuleById(id: string): Promise<PointsRule | null> {
  return dual(
    async () => (await import("./membership-supabase")).findRuleByIdDual(id),
    () => localFindRuleById(id),
  );
}

export async function createRule(rule: PointsRule): Promise<PointsRule> {
  return dual(
    async () => (await import("./membership-supabase")).createRuleDual(rule),
    () => localCreateRule(rule),
  );
}

export async function updateRule(id: string, patch: Partial<PointsRule>): Promise<PointsRule | null> {
  return dual(
    async () => (await import("./membership-supabase")).updateRuleDual(id, patch),
    () => localUpdateRule(id, patch),
  );
}

export async function deleteRule(id: string): Promise<void> {
  return dual(
    async () => (await import("./membership-supabase")).deleteRuleDual(id),
    () => localDeleteRule(id),
  );
}

/** ===== 等级 ===== */
export function localFindAllTiers(): TierConfig[] {
  return load<TierConfig>("tiers");
}

export function localUpdateTier(tier: TierConfig["tier"], patch: Partial<TierConfig>): TierConfig | null {
  const all = load<TierConfig>("tiers");
  const idx = all.findIndex(t => t.tier === tier);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch };
  save("tiers", all);
  return all[idx];
}

export async function findAllTiers(): Promise<TierConfig[]> {
  return dual(
    async () => (await import("./membership-supabase")).findAllTiersDual(),
    localFindAllTiers,
  );
}

export async function updateTier(tier: TierConfig["tier"], patch: Partial<TierConfig>): Promise<TierConfig | null> {
  return dual(
    async () => (await import("./membership-supabase")).updateTierDual(tier, patch),
    () => localUpdateTier(tier, patch),
  );
}

/** ===== 客户会员档案 ===== */
export function localFindAllMemberships(): PatientMembership[] {
  return load<PatientMembership>("memberships").filter(m => !m.deletedAt);
}

export function localGetOrCreateMembership(patientId: string): PatientMembership {
  const all = load<PatientMembership>("memberships");
  const existing = all.find(m => m.patientId === patientId && !m.deletedAt);
  if (existing) return existing;
  const fresh: PatientMembership = {
    patientId,
    tier: "regular",
    points: 0,
    totalEarned: 0,
    totalSpent: 0,
    registeredAt: new Date().toISOString(),
    note: null,
    deletedAt: null,
    deletedBy: null,
  };
  patientMembershipSchema.parse(fresh);
  all.push(fresh);
  save("memberships", all);
  return fresh;
}

export function localUpdateMembership(
  patientId: string,
  patch: Partial<PatientMembership>,
): PatientMembership | null {
  const all = load<PatientMembership>("memberships");
  const idx = all.findIndex(m => m.patientId === patientId);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch };
  save("memberships", all);
  return all[idx];
}

export async function findAllMemberships(): Promise<PatientMembership[]> {
  return dual(
    async () => {
      const ms = await import("./membership-supabase");
      // Supabase 没有 findAllMembershipsDual,先查 patient_memberships 全表
      const supabase = getSupabase()!;
      const { data, error } = await supabase.from("patient_memberships").select("*").is("deleted_at", null);
      if (error) throw new Error(`查询会员档案失败: ${error.message}`);
      return (data ?? []).map((row: Record<string, unknown>) => ({
        patientId: String(row.patient_id),
        tier: row.tier as PatientMembership["tier"],
        points: Number(row.points),
        totalEarned: Number(row.total_earned),
        totalSpent: Number(row.total_spent),
        registeredAt: String(row.registered_at),
        note: (row.note as string | null) ?? null,
        deletedAt: (row.deleted_at as string | null) ?? null,
        deletedBy: (row.deleted_by as string | null) ?? null,
      }));
    },
    localFindAllMemberships,
  );
}

export async function getOrCreateMembership(patientId: string): Promise<PatientMembership> {
  return dual(
    async () => (await import("./membership-supabase")).getOrCreateMembershipDual(patientId),
    () => localGetOrCreateMembership(patientId),
  );
}

export async function updateMembership(
  patientId: string,
  patch: Partial<PatientMembership>,
): Promise<PatientMembership | null> {
  return dual(
    async () => {
      const ms = await import("./membership-supabase");
      const current = await ms.findMembershipByPatientDual(patientId);
      if (!current) return null;
      return ms.upsertMembershipDual({ ...current, ...patch } as PatientMembership);
    },
    () => localUpdateMembership(patientId, patch),
  );
}

/** ===== 积分流水 ===== */
export function localFindAllLogs(): PointsLog[] {
  return load<PointsLog>("logs").filter(l => !l.deletedAt);
}

export function localAppendLog(log: PointsLog): PointsLog {
  pointsLogSchema.parse(log);
  const all = load<PointsLog>("logs");
  all.push(log);
  save("logs", all);
  return log;
}

export function localGetRecentLogs(patientId: string, limit = 20): PointsLog[] {
  return load<PointsLog>("logs")
    .filter(l => l.patientId === patientId && !l.deletedAt)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

export function localGetLogsForRule(ruleId: string, patientId?: string): PointsLog[] {
  return load<PointsLog>("logs").filter(
    l => l.ruleId === ruleId && !l.deletedAt && (!patientId || l.patientId === patientId),
  );
}

export async function findAllLogs(): Promise<PointsLog[]> {
  return dual(
    async () => {
      const supabase = getSupabase()!;
      // eslint-disable-next-line no-console
      console.log("[findAllLogs] query start");
      const { data, error } = await supabase.from("points_logs").select("*").is("deleted_at", null).order("created_at", { ascending: false });
      // eslint-disable-next-line no-console
      console.log("[findAllLogs] result data.length=", data?.length, "error=", error?.message);
      if (error) throw new Error(`查询积分流水失败: ${error.message}`);
      return (data ?? []).map((row: Record<string, unknown>) => ({
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
      }));
    },
    localFindAllLogs,
  );
}

export async function appendLog(log: PointsLog): Promise<PointsLog> {
  return dual(
    async () => (await import("./membership-supabase")).appendLogDual(log),
    () => localAppendLog(log),
  );
}

export async function getRecentLogs(patientId: string, limit = 20): Promise<PointsLog[]> {
  return dual(
    async () => (await import("./membership-supabase")).getRecentLogsDual(patientId, limit),
    () => localGetRecentLogs(patientId, limit),
  );
}

export async function getLogsForRule(ruleId: string, patientId?: string): Promise<PointsLog[]> {
  return dual(
    async () => {
      const supabase = getSupabase()!;
      let q = supabase
        .from("points_logs")
        .select("*")
        .eq("rule_id", ruleId)
        .eq("org_id", getSession().orgId)
        .is("deleted_at", null);
      if (patientId) q = q.eq("patient_id", patientId);
      const { data, error } = await q;
      if (error) throw new Error(`查询积分流水失败: ${error.message}`);
      return (data ?? []).map((row: Record<string, unknown>) => ({
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
      }));
    },
    () => localGetLogsForRule(ruleId, patientId),
  );
}

/**
 * 级联软删:客户被删除时,把指向该 patientId 的记录打 deletedAt 标记。
 */
export function localMarkMembershipsOrphanedByPatient(patientId: string): number {
  const all = load<PatientMembership>("memberships");
  const ts = new Date().toISOString();
  let n = 0;
  for (const m of all) {
    if (m.patientId === patientId && !m.deletedAt) {
      m.deletedAt = ts;
      n++;
    }
  }
  if (n > 0) save("memberships", all);
  return n;
}

export function localMarkLogsOrphanedByPatient(patientId: string): number {
  const all = load<PointsLog>("logs");
  const ts = new Date().toISOString();
  let n = 0;
  for (const l of all) {
    if (l.patientId === patientId && !l.deletedAt) {
      l.deletedAt = ts;
      n++;
    }
  }
  if (n > 0) save("logs", all);
  return n;
}

export function localMarkRedemptionsOrphanedByPatient(patientId: string): number {
  const all = load<Redemption>("redemptions");
  const ts = new Date().toISOString();
  let n = 0;
  for (const r of all) {
    if (r.patientId === patientId && !r.deletedAt) {
      r.deletedAt = ts;
      n++;
    }
  }
  if (n > 0) save("redemptions", all);
  return n;
}

export async function markMembershipsOrphanedByPatient(patientId: string): Promise<number> {
  return dual(
    async () => (await import("./membership-supabase")).markMembershipsOrphanedByPatientDual(patientId),
    () => localMarkMembershipsOrphanedByPatient(patientId),
  );
}

export async function markLogsOrphanedByPatient(patientId: string): Promise<number> {
  return dual(
    async () => (await import("./membership-supabase")).markLogsOrphanedByPatientDual(patientId),
    () => localMarkLogsOrphanedByPatient(patientId),
  );
}

export async function markRedemptionsOrphanedByPatient(patientId: string): Promise<number> {
  return dual(
    async () => (await import("./membership-supabase")).markRedemptionsOrphanedByPatientDual(patientId),
    () => localMarkRedemptionsOrphanedByPatient(patientId),
  );
}

/** 兼容旧调用 — 提供对象风格的仓储 */
export const ruleRepository = {
  findAll: findAllRules,
  findById: findRuleById,
  create: createRule,
  update: updateRule,
  remove: deleteRule,
};

export const tierRepository = {
  findAll: findAllTiers,
  update: updateTier,
};

export const patientMembershipRepository = {
  findAll: findAllMemberships,
};

export const pointsLogRepository = {
  findAll: findAllLogs,
  create: appendLog,
};

void tierRepository;
void patientMembershipRepository;

/** ===== 兑换商品 ===== */
ensureSeeded("reward-products", REWARD_SEED);

export function localFindAllRewards(): RewardProduct[] {
  return load<RewardProduct>("reward-products");
}
export function localFindRewardById(id: string): RewardProduct | null {
  return load<RewardProduct>("reward-products").find(r => r.id === id) ?? null;
}
export function localCreateReward(r: RewardProduct): RewardProduct {
  rewardProductSchema.parse(r);
  const all = load<RewardProduct>("reward-products");
  all.push(r);
  save("reward-products", all);
  return r;
}
export function localUpdateReward(id: string, patch: Partial<RewardProduct>): RewardProduct | null {
  const all = load<RewardProduct>("reward-products");
  const idx = all.findIndex(r => r.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch };
  save("reward-products", all);
  return all[idx];
}
export function localDeleteReward(id: string): void {
  save("reward-products", load<RewardProduct>("reward-products").filter(r => r.id !== id));
}

export async function findAllRewards(): Promise<RewardProduct[]> {
  return dual(
    async () => (await import("./membership-supabase")).findAllRewardsDual(),
    localFindAllRewards,
  );
}

export async function findRewardById(id: string): Promise<RewardProduct | null> {
  return dual(
    async () => (await import("./membership-supabase")).findRewardByIdDual(id),
    () => localFindRewardById(id),
  );
}

export async function createReward(r: RewardProduct): Promise<RewardProduct> {
  return dual(
    async () => (await import("./membership-supabase")).createRewardDual(r),
    () => localCreateReward(r),
  );
}

export async function updateReward(id: string, patch: Partial<RewardProduct>): Promise<RewardProduct | null> {
  return dual(
    async () => (await import("./membership-supabase")).updateRewardDual(id, patch),
    () => localUpdateReward(id, patch),
  );
}

export async function deleteReward(id: string): Promise<void> {
  return dual(
    async () => (await import("./membership-supabase")).deleteRewardDual(id),
    () => localDeleteReward(id),
  );
}

/** ===== 兑换订单 ===== */
export function localFindAllRedemptions(): Redemption[] {
  return load<Redemption>("redemptions").filter(r => !r.deletedAt);
}
export function localFindRedemptionsByPatient(patientId: string): Redemption[] {
  return load<Redemption>("redemptions").filter(r => r.patientId === patientId && !r.deletedAt);
}
export function localCreateRedemption(r: Redemption): Redemption {
  redemptionSchema.parse(r);
  const all = load<Redemption>("redemptions");
  all.push(r);
  save("redemptions", all);
  return r;
}
export function localUpdateRedemption(id: string, patch: Partial<Redemption>): Redemption | null {
  const all = load<Redemption>("redemptions");
  const idx = all.findIndex(r => r.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch };
  save("redemptions", all);
  return all[idx];
}

export async function findAllRedemptions(): Promise<Redemption[]> {
  return dual(
    async () => (await import("./membership-supabase")).findAllRedemptionsDual(),
    localFindAllRedemptions,
  );
}

export async function findRedemptionsByPatient(patientId: string): Promise<Redemption[]> {
  return dual(
    async () => (await import("./membership-supabase")).findRedemptionsByPatientDual(patientId),
    () => localFindRedemptionsByPatient(patientId),
  );
}

export async function createRedemption(r: Redemption): Promise<Redemption> {
  return dual(
    async () => (await import("./membership-supabase")).createRedemptionDual(r),
    () => localCreateRedemption(r),
  );
}

export async function updateRedemption(id: string, patch: Partial<Redemption>): Promise<Redemption | null> {
  return dual(
    async () => (await import("./membership-supabase")).updateRedemptionDual(id, patch),
    () => localUpdateRedemption(id, patch),
  );
}

export const rewardRepository = {
  findAll: findAllRewards,
  findById: findRewardById,
  create: createReward,
  update: updateReward,
  remove: deleteReward,
};

export const redemptionRepository = {
  findAll: findAllRedemptions,
  findByPatient: findRedemptionsByPatient,
  create: createRedemption,
  update: updateRedemption,
};
