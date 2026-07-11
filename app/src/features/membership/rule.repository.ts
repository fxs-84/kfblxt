/**
 * 规则 + 等级 + 患者会员档案 + 积分流水 — localStorage 仓储
 * 跳过通用 Entity 约束,使用 patientId 作主键,时间戳用 ISO 字符串
 */
import { BUILTIN_RULES, DEFAULT_TIERS } from "./builtin-rules";
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
  if (load(name).length === 0) save(name, seed);
}

/** ===== 规则 ===== */
ensureSeeded("rules", BUILTIN_RULES);
ensureSeeded("tiers", DEFAULT_TIERS);

export async function findAllRules(): Promise<PointsRule[]> {
  return load<PointsRule>("rules");
}

export async function findRuleById(id: string): Promise<PointsRule | null> {
  return load<PointsRule>("rules").find(r => r.id === id) ?? null;
}

export async function createRule(rule: PointsRule): Promise<PointsRule> {
  ruleSchema.parse(rule);
  const all = load<PointsRule>("rules");
  console.log("[findAllRules] count=", all.length, "rules:", all.map(r => r.name + "(" + r.enabled + ")").join(", "));
  all.push(rule);
  save("rules", all);
  return rule;
}

export async function updateRule(id: string, patch: Partial<PointsRule>): Promise<PointsRule | null> {
  const all = load<PointsRule>("rules");
  const idx = all.findIndex(r => r.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch };
  save("rules", all);
  return all[idx];
}

export async function deleteRule(id: string): Promise<void> {
  save("rules", load<PointsRule>("rules").filter(r => r.id !== id));
}

/** ===== 等级 ===== */
export async function findAllTiers(): Promise<TierConfig[]> {
  return load<TierConfig>("tiers");
}

export async function updateTier(tier: MemberTier, patch: Partial<TierConfig>): Promise<TierConfig | null> {
  const all = load<TierConfig>("tiers");
  const idx = all.findIndex(t => t.tier === tier);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch };
  save("tiers", all);
  return all[idx];
}

/** ===== 患者会员档案 ===== */
export async function findAllMemberships(): Promise<PatientMembership[]> {
  return load<PatientMembership>("memberships");
}

export async function getOrCreateMembership(patientId: string): Promise<PatientMembership> {
  const all = load<PatientMembership>("memberships");
  const existing = all.find(m => m.patientId === patientId);
  if (existing) return existing;
  const fresh: PatientMembership = {
    patientId,
    tier: "regular",
    points: 0,
    totalEarned: 0,
    totalSpent: 0,
    registeredAt: new Date().toISOString(),
    note: null,
  };
  patientMembershipSchema.parse(fresh);
  all.push(fresh);
  save("memberships", all);
  return fresh;
}

export async function updateMembership(
  patientId: string,
  patch: Partial<PatientMembership>,
): Promise<PatientMembership | null> {
  const all = load<PatientMembership>("memberships");
  const idx = all.findIndex(m => m.patientId === patientId);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch };
  save("memberships", all);
  return all[idx];
}

/** ===== 积分流水 ===== */
export async function findAllLogs(): Promise<PointsLog[]> {
  return load<PointsLog>("logs");
}

export async function appendLog(log: PointsLog): Promise<PointsLog> {
  pointsLogSchema.parse(log);
  const all = load<PointsLog>("logs");
  all.push(log);
  save("logs", all);
  return log;
}

export async function getRecentLogs(patientId: string, limit = 20): Promise<PointsLog[]> {
  return load<PointsLog>("logs")
    .filter(l => l.patientId === patientId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

export async function getLogsForRule(ruleId: string, patientId?: string): Promise<PointsLog[]> {
  return load<PointsLog>("logs").filter(l => l.ruleId === ruleId && (!patientId || l.patientId === patientId));
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

// Import MemberTier alias to avoid unused warning
import type { MemberTier } from "./models";
void tierRepository;
void patientMembershipRepository;

/** ===== 兑换商品 ===== */
const REWARD_SEED: RewardProduct[] = [
  { id: "reward_elastics", name: "弹力带训练包", description: "含 5 条不同阻力的弹力带 + 训练手册", category: "training", pointsCost: 300, imageEmoji: "🩰", stock: -1, tierRequired: null, enabled: true, createdAt: new Date().toISOString() },
  { id: "reward_balance_disc", name: "平衡训练光盘", description: "12 节平衡训练高清视频", category: "training", pointsCost: 500, imageEmoji: "💿", stock: -1, tierRequired: null, enabled: true, createdAt: new Date().toISOString() },
  { id: "reward_phone_followup", name: "电话回访 1 次", description: "治疗师主动电话回访 30 分钟", category: "service", pointsCost: 800, imageEmoji: "📞", stock: -1, tierRequired: "silver", enabled: true, createdAt: new Date().toISOString() },
  { id: "reward_online_qa", name: "在线答疑 30 分钟", description: "治疗师在线视频答疑", category: "consult", pointsCost: 1000, imageEmoji: "💬", stock: -1, tierRequired: "silver", enabled: true, createdAt: new Date().toISOString() },
  { id: "reward_discount_90", name: "9 折就诊券", description: "下次就诊 9 折优惠", category: "discount", pointsCost: 500, imageEmoji: "🎟️", stock: -1, tierRequired: null, enabled: true, createdAt: new Date().toISOString() },
  { id: "reward_free_visit", name: "免费复诊券", description: "下次复诊免费一次", category: "service", pointsCost: 2000, imageEmoji: "🎫", stock: -1, tierRequired: "gold", enabled: true, createdAt: new Date().toISOString() },
  { id: "reward_expert", name: "三甲专家会诊咨询", description: "三甲康复专家 30 分钟会诊咨询", category: "consult", pointsCost: 5000, imageEmoji: "👨‍⚕️", stock: 5, tierRequired: "diamond", enabled: true, createdAt: new Date().toISOString() },
  { id: "reward_plan", name: "个性化训练计划定制", description: "治疗师 1 对 1 定制 4 周训练计划", category: "training", pointsCost: 2000, imageEmoji: "📋", stock: -1, tierRequired: "silver", enabled: true, createdAt: new Date().toISOString() },
];
ensureSeeded("reward-products", REWARD_SEED);

export async function findAllRewards(): Promise<RewardProduct[]> {
  return load<RewardProduct>("reward-products");
}
export async function findRewardById(id: string): Promise<RewardProduct | null> {
  return load<RewardProduct>("reward-products").find(r => r.id === id) ?? null;
}
export async function createReward(r: RewardProduct): Promise<RewardProduct> {
  rewardProductSchema.parse(r);
  const all = load<RewardProduct>("reward-products");
  all.push(r);
  save("reward-products", all);
  return r;
}
export async function updateReward(id: string, patch: Partial<RewardProduct>): Promise<RewardProduct | null> {
  const all = load<RewardProduct>("reward-products");
  const idx = all.findIndex(r => r.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch };
  save("reward-products", all);
  return all[idx];
}
export async function deleteReward(id: string): Promise<void> {
  save("reward-products", load<RewardProduct>("reward-products").filter(r => r.id !== id));
}

/** ===== 兑换订单 ===== */
export async function findAllRedemptions(): Promise<Redemption[]> {
  return load<Redemption>("redemptions");
}
export async function findRedemptionsByPatient(patientId: string): Promise<Redemption[]> {
  return load<Redemption>("redemptions").filter(r => r.patientId === patientId);
}
export async function createRedemption(r: Redemption): Promise<Redemption> {
  redemptionSchema.parse(r);
  const all = load<Redemption>("redemptions");
  all.push(r);
  save("redemptions", all);
  return r;
}
export async function updateRedemption(id: string, patch: Partial<Redemption>): Promise<Redemption | null> {
  const all = load<Redemption>("redemptions");
  const idx = all.findIndex(r => r.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch };
  save("redemptions", all);
  return all[idx];
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