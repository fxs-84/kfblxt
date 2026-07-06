import { z } from "zod";
import { ALL_REGION_NAMES } from "../../components/bodymap/regions";

/**
 * 就诊记录(encounter)承载一次门诊,内嵌主诉(chief complaint)。
 * 主诉字段按 ANRM 病历需要:症状定位(结构化人体区域 + 皮区备注)、神经症状性质、VAS、病程。
 * mock 阶段将主诉内嵌;接 DB 时可拆为独立 chief_complaints 表。
 */
export const visitTypeEnum = z.enum(["初诊", "复诊"]);
export type VisitType = z.infer<typeof visitTypeEnum>;

export const bodyRegionEnum = z.enum(ALL_REGION_NAMES as [string, ...string[]]);

/** ANRM 全谱系症状性质,按系统分组 */
export const SYMPTOM_GROUPS = {
  "疼痛": ["酸痛", "刺痛", "胀痛", "灼痛", "撕裂痛", "牵拉痛", "压痛", "放射痛", "夜间痛"] as const,
  "感觉异常": ["麻木", "感觉减退", "感觉过敏", "蚁走感", "烧灼感", "冰冷感", "触电感", "束带感"] as const,
  "运动障碍": ["无力", "僵硬", "痉挛", "肌肉萎缩", "不自主运动", "震颤", "精细动作困难", "疲劳"] as const,
  "前庭/平衡": ["眩晕", "头晕", "不稳感", "晕动病", "视物晃动", "倾斜感", "漂浮感"] as const,
  "步态/姿势": ["跛行", "拖步", "跨阈步态", "宽基步态", "慌张步态", "姿势异常", "起步困难", "转身困难"] as const,
  "自主神经": ["心悸", "出汗异常", "皮肤颜色变化", "血压波动", "排尿异常", "排便异常", "睡眠障碍", "性功能障碍"] as const,
  "认知/精神": ["注意力不集中", "记忆力减退", "执行功能下降", "焦虑", "抑郁", "易激惹", "脑雾", "阅读困难"] as const,
  "发育/学习": ["发育迟缓", "学习困难", "协调障碍", "读写困难", "注意力缺陷", "书写困难", "运动发育落后"] as const,
  "视听/颅神经": ["视力模糊", "复视", "耳鸣", "听力下降", "眼球运动异常", "吞咽困难", "构音障碍", "面部麻木"] as const,
  "功能受限": ["活动受限", "日常生活困难", "运动不耐受", "久坐困难", "久站困难", "上楼困难", "下蹲困难", "举手困难"] as const,
  "其他": ["头痛", "颈痛", "腰痛", "关节弹响", "肿胀", "晨僵", "卡顿感", "其他"] as const,
} as const;

export type SymptomGroup = keyof typeof SYMPTOM_GROUPS;

export const symptomNatureEnum = z.enum(
  Object.values(SYMPTOM_GROUPS).flat() as unknown as [string, ...string[]],
);
export type SymptomNature = z.infer<typeof symptomNatureEnum>;

export const SYMPTOM_GROUP_KEYS = Object.keys(SYMPTOM_GROUPS) as SymptomGroup[];

export const chiefComplaintSchema = z.object({
  regions: z.array(bodyRegionEnum).min(1, "请在人体图上至少标记一个症状区域"),
  distributionNote: z.string().trim().max(200).optional().or(z.literal("")),
  nature: z.array(symptomNatureEnum).min(1, "至少选择一项症状性质"),
  vas: z.number().int("VAS 为整数").min(0).max(10),
  durationText: z.string().trim().min(1, "病程不能为空").max(100),
  onset: z.string().trim().max(200).optional().or(z.literal("")),
});
export type ChiefComplaint = z.infer<typeof chiefComplaintSchema>;

export const encounterSchema = z.object({
  id: z.string().uuid().optional(),
  orgId: z.string().uuid(),
  patientId: z.string().uuid(),
  encounterDate: z.coerce.date().refine((d) => d <= new Date(), "就诊日期不能晚于今天"),
  visitType: visitTypeEnum,
  status: z.enum(["进行中", "已结束"]).default("进行中"),
  chiefComplaint: chiefComplaintSchema,
  /** 就诊实际消费金额(元) — 用于积分累计和升级 */
  amount: z.number().min(0).optional().default(0),
  soapNote: z.string().optional().or(z.literal("")),
  createdAt: z.coerce.date().optional(),
});
export type Encounter = z.infer<typeof encounterSchema>;

export const encounterInputSchema = encounterSchema.omit({ id: true, createdAt: true });
export type EncounterInput = z.infer<typeof encounterInputSchema>;

/** 标记已结束的输入 */
export const encounterCloseSchema = z.object({
  status: z.literal("已结束"),
});
