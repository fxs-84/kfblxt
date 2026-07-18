/**
 * 会员积分系统 — 数据模型
 */
import { z } from "zod";

export const MEMBER_TIERS = ["regular", "silver", "gold", "diamond"] as const;
export type MemberTier = (typeof MEMBER_TIERS)[number];

export const TRIGGER_TYPES = [
  "encounter.closed",
  "encounter.created",
  "diagnosis.created",
  "patient.created",
  "share.sent",
  "patient.recommend",
  "patient.birthday",
  "encounter.nth",
  "billing.consumed",
  "billing.recharged",
  "manual",
] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const TRIGGER_LABEL: Record<TriggerType, string> = {
  "encounter.closed": "完成就诊",
  "encounter.created": "创建就诊",
  "diagnosis.created": "完成诊断",
  "patient.created": "新建客户档案",
  "share.sent": "分享随访",
  "patient.recommend": "推荐新客户",
  "patient.birthday": "客户生日",
  "encounter.nth": "第 N 次就诊",
  "billing.consumed": "消费扣款",
  "billing.recharged": "充值入账",
  "manual": "治疗师手动调整",
};

export const CONDITION_FIELDS = [
  "patient.tier",
  "encounter.amount",
  "patient.age",
  "patient.isFirstVisit",
] as const;
export type ConditionField = (typeof CONDITION_FIELDS)[number];

export const CONDITION_OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "in"] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

export const CONDITION_FIELD_LABEL: Record<ConditionField, string> = {
  "patient.tier": "客户等级",
  "encounter.amount": "消费/充值金额",
  "patient.age": "客户年龄",
  "patient.isFirstVisit": "是否首次就诊",
};

export const CONDITION_OP_LABEL: Record<ConditionOp, string> = {
  eq: "等于",
  neq: "不等于",
  gt: "大于",
  gte: "大于等于",
  lt: "小于",
  lte: "小于等于",
  in: "属于",
};

export const conditionSchema = z.object({
  field: z.enum(CONDITION_FIELDS),
  op: z.enum(CONDITION_OPS),
  value: z.union([z.string(), z.number(), z.array(z.string()), z.array(z.number())]),
});
export type RuleCondition = z.infer<typeof conditionSchema>;

export const actionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("award_fixed"), points: z.number().int(), reason: z.string() }),
  z.object({ kind: z.literal("award_ratio"), pointsPerYuan: z.number(), reason: z.string() }),
  z.object({ kind: z.literal("set_tier"), tier: z.enum(MEMBER_TIERS) }),
]);
export type RuleAction = z.infer<typeof actionSchema>;

export const ruleSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  enabled: z.boolean(),
  builtin: z.boolean(),
  trigger: z.enum(TRIGGER_TYPES),
  conditions: z.array(conditionSchema),
  action: actionSchema,
  cooldownDays: z.number().int().min(0).default(0),
  maxPerPatient: z.number().int().min(0).default(0),
  priority: z.number().int().default(0),
  order: z.number().int().default(0),
  validFrom: z.string().nullable().default(null),
  validUntil: z.string().nullable().default(null),
});
export type PointsRule = z.infer<typeof ruleSchema>;

export const tierConfigSchema = z.object({
  tier: z.enum(MEMBER_TIERS),
  name: z.string(),
  color: z.string(),
  icon: z.string(),
  minTotalSpent: z.number().min(0),
  pointMultiplier: z.number().min(0),
  discountOnRedeem: z.number().min(0).max(1),
});
export type TierConfig = z.infer<typeof tierConfigSchema>;

export const patientMembershipSchema = z.object({
  patientId: z.string(),
  tier: z.enum(MEMBER_TIERS),
  points: z.number().int(),
  totalEarned: z.number().int(),
  totalSpent: z.number().min(0),
  registeredAt: z.string(),
  note: z.string().nullable().default(null),
  /** 软删标记 — 客户被删除后由 useDeletePatient 级联置位,findAll* 自动过滤 */
  deletedAt: z.string().nullable().default(null),
  /** 软删操作者 */
  deletedBy: z.string().nullable().default(null),
});
export type PatientMembership = z.infer<typeof patientMembershipSchema>;

export const pointsLogSchema = z.object({
  id: z.string(),
  patientId: z.string(),
  delta: z.number().int(),
  balanceAfter: z.number().int(),
  reason: z.string(),
  ruleId: z.string().nullable().default(null),
  triggerType: z.enum(TRIGGER_TYPES).nullable().default(null),
  refType: z.enum(["encounter", "patient", "share", "manual"]).nullable().default(null),
  refId: z.string().nullable().default(null),
  operatorId: z.string(),
  createdAt: z.string(),
  /** 软删标记 — 审计/计费证据保留,仅前台不显示 */
  deletedAt: z.string().nullable().default(null),
});
export type PointsLog = z.infer<typeof pointsLogSchema>;

// ===== 兑换商品 =====
export const REWARD_CATEGORIES = ["training", "consult", "product", "service", "discount"] as const;
export type RewardCategory = (typeof REWARD_CATEGORIES)[number];

export const REWARD_CATEGORY_LABEL: Record<RewardCategory, string> = {
  training: "训练包",
  consult: "咨询服务",
  product: "康复用品",
  service: "诊疗服务",
  discount: "折扣券",
};

export const rewardProductSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string(),
  category: z.enum(REWARD_CATEGORIES),
  pointsCost: z.number().int().min(0),
  imageEmoji: z.string().default("🎁"),
  stock: z.number().int().min(-1).default(-1), // -1 = 无限
  tierRequired: z.enum(MEMBER_TIERS).nullable().default(null),
  enabled: z.boolean().default(true),
  createdAt: z.string(),
});
export type RewardProduct = z.infer<typeof rewardProductSchema>;

// ===== 兑换订单 =====
export const REDEMPTION_STATUSES = ["pending", "fulfilled", "cancelled", "expired"] as const;
export type RedemptionStatus = (typeof REDEMPTION_STATUSES)[number];
export const REDEMPTION_STATUS_LABEL: Record<RedemptionStatus, string> = {
  pending: "待审核",
  fulfilled: "已兑换",
  cancelled: "已取消",
  expired: "已过期",
};

export const redemptionSchema = z.object({
  id: z.string(),
  patientId: z.string(),
  rewardId: z.string(),
  rewardName: z.string(), // 快照,商品改名也不影响历史
  pointsCost: z.number().int(), // 快照
  status: z.enum(REDEMPTION_STATUSES),
  notes: z.string().nullable().default(null),
  operatorId: z.string(),
  createdAt: z.string(),
  fulfilledAt: z.string().nullable().default(null),
  cancelledAt: z.string().nullable().default(null),
  /** 软删标记 — 客户被删除后由 useDeletePatient 级联置位 */
  deletedAt: z.string().nullable().default(null),
});
export type Redemption = z.infer<typeof redemptionSchema>;

/** 触发事件(规则引擎输入) */
export type TriggerEvent =
  | { type: "encounter.closed"; patientId: string; encounterId: string; amount: number; createdAt: Date }
  | { type: "encounter.created"; patientId: string; encounterId: string; createdAt: Date }
  | { type: "diagnosis.created"; patientId: string; encounterId: string; patientId2?: string; createdAt: Date }
  | { type: "patient.created"; patientId: string; createdAt: Date }
  | { type: "share.sent"; patientId: string; shareToken: string; createdAt: Date }
  | { type: "patient.recommend"; patientId: string; refPatientId: string; createdAt: Date }
  | { type: "patient.birthday"; patientId: string; createdAt: Date }
  | { type: "encounter.nth"; patientId: string; encounterId: string; nth: number; createdAt: Date }
  | { type: "billing.consumed"; patientId: string; billingId: string; amount: number; encounterId?: string; createdAt: Date }
  | { type: "billing.recharged"; patientId: string; billingId: string; amount: number; createdAt: Date }
  | { type: "manual"; patientId: string; delta: number; reason: string; operatorId: string; createdAt: Date };