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
  "manual",
] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const TRIGGER_LABEL: Record<TriggerType, string> = {
  "encounter.closed": "完成就诊",
  "encounter.created": "创建就诊",
  "diagnosis.created": "完成诊断",
  "patient.created": "新建患者档案",
  "share.sent": "分享随访",
  "patient.recommend": "推荐新患者",
  "patient.birthday": "患者生日",
  "encounter.nth": "第 N 次就诊",
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
});
export type PointsLog = z.infer<typeof pointsLogSchema>;

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
  | { type: "manual"; patientId: string; delta: number; reason: string; operatorId: string; createdAt: Date };