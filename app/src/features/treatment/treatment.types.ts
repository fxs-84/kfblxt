/**
 * ANRM 治疗记录核心类型。
 * interventions_catalog:干预技术库(按神经通路标签化)
 * treatment_plans:治疗计划(分期/剂量/目标/康复界限)
 * progress_notes:进展复评(立即/短期/长期疗效判定)
 */

/** 干预技术大类 */
export type InterventionCategory =
  | "神经调控"
  | "前庭-眼动训练"
  | "原始反射整合"
  | "手法/器械"
  | "运动康复"
  | "运动控制/稳定性"
  | "生活方式/代谢";

export const INTERVENTION_CATEGORIES: readonly InterventionCategory[] = [
  "神经调控", "前庭-眼动训练", "原始反射整合",
  "手法/器械", "运动康复", "运动控制/稳定性", "生活方式/代谢",
];

/** 神经目标通路(供筛选/分组) */
export type NeuroTarget =
  | "IA纤维"
  | "IB纤维"
  | "皮质"
  | "小脑"
  | "前庭"
  | "基底节"
  | "脑干"
  | "自主神经"
  | "脊髓前角"
  | "WDR神经元";

/** 干预技术定义 */
export interface InterventionDef {
  id: string;
  category: InterventionCategory;
  name: string;
  neuroTargets: NeuroTarget[];
  /** 适应症 */
  indications: string;
  /** 操作参数(如 20s×5点 / 5reps 快速 / 30下 VOR) */
  parameters: string;
  /** 禁忌/注意 */
  precautions?: string;
  /** 待医师确认 */
  pendingConfirmation?: boolean;
}

/** 治疗分期 */
export type TreatmentPhase =
  | "急性期"
  | "恢复期"
  | "巩固期"
  | "维持期";

export const TREATMENT_PHASES: readonly TreatmentPhase[] = [
  "急性期", "恢复期", "巩固期", "维持期",
];

export interface TreatmentGoal {
  term: "short" | "long";
  description: string;
  metric?: string;
  target?: string;
  deadline?: string;
}

/** 预设目标模板(按域分组),供治疗计划快速选择 */
export interface GoalTemplate {
  id: string;
  domain: string;
  description: string;
  exampleMetric: string;
  term: "short" | "long";
}

export const GOAL_TEMPLATES: readonly GoalTemplate[] = [
  /* 疼痛 */
  { id: "pain-vas",       domain: "疼痛", description: "VAS 疼痛评分降低",             exampleMetric: "7→3 分",   term: "short" },
  { id: "pain-frequency", domain: "疼痛", description: "疼痛发作频率减少",             exampleMetric: "每日→每周", term: "short" },
  { id: "pain-duration",  domain: "疼痛", description: "单次疼痛持续时间缩短",         exampleMetric: "持续→间歇", term: "short" },
  { id: "pain-medication",domain: "疼痛", description: "减少镇痛药物使用",             exampleMetric: "停用/减半",  term: "long" },
  { id: "pain-resolution",domain: "疼痛", description: "疼痛完全缓解(ADL 无受限)",     exampleMetric: "VAS 0-1",   term: "long" },
  /* 关节活动度 */
  { id: "rom-cervical",   domain: "关节活动度", description: "颈椎 ROM 恢复",          exampleMetric: "旋转 70°",  term: "short" },
  { id: "rom-shoulder",   domain: "关节活动度", description: "肩关节 ROM 恢复",        exampleMetric: "屈曲 160°", term: "short" },
  { id: "rom-lumbar",     domain: "关节活动度", description: "腰椎 ROM 恢复",          exampleMetric: "前屈 90°",  term: "short" },
  { id: "rom-hip",        domain: "关节活动度", description: "髋关节 ROM 恢复",        exampleMetric: "伸直 0°",   term: "short" },
  { id: "rom-full",       domain: "关节活动度", description: "各关节主动 ROM 恢复至正常", exampleMetric: "达标",       term: "long" },
  /* 肌力 */
  { id: "strength-mmt",   domain: "肌力", description: "徒手肌力提升(MMT)",            exampleMetric: "3→4级",    term: "short" },
  { id: "strength-grip",  domain: "肌力", description: "握力提升",                     exampleMetric: "+5 kg",     term: "short" },
  { id: "strength-core",  domain: "肌力", description: "核心肌力达标(平板支撑)",       exampleMetric: "≥60 s",    term: "short" },
  { id: "strength-functional",domain: "肌力", description: "功能性肌力恢复(ADL 独立)", exampleMetric: "独立完成",    term: "long" },
  /* 平衡/前庭 */
  { id: "balance-berg",   domain: "平衡/前庭", description: "Berg 平衡量表提升",       exampleMetric: "35→50 分", term: "short" },
  { id: "balance-stand",  domain: "平衡/前庭", description: "单脚站立时间提升",         exampleMetric: "≥30 s",    term: "short" },
  { id: "balance-tug",    domain: "平衡/前庭", description: "TUG 起立-行走时间改善",    exampleMetric: "≤12 s",    term: "short" },
  { id: "balance-fall",   domain: "平衡/前庭", description: "跌倒风险降低(FRT)",        exampleMetric: ">20 cm",   term: "short" },
  { id: "vestibular-no-dizzy",domain: "平衡/前庭", description: "眩晕发作消失",         exampleMetric: "0次/月",   term: "long" },
  /* 步态 */
  { id: "gait-speed",     domain: "步态", description: "步行速度提升(10m 测试)",       exampleMetric: "≥1.2 m/s", term: "short" },
  { id: "gait-distance",  domain: "步态", description: "步行耐力提升(6min)",            exampleMetric: "≥500 m",  term: "short" },
  { id: "gait-symmetry",  domain: "步态", description: "步态对称性改善",               exampleMetric: "对称",       term: "short" },
  { id: "gait-no-aid",    domain: "步态", description: "脱辅具独立行走",               exampleMetric: "无拐杖",     term: "long" },
  /* 感觉/本体 */
  { id: "sensory-reduce-numb",domain: "感觉/本体", description: "麻木范围缩小",         exampleMetric: "面积缩小 50%",term: "short" },
  { id: "sensory-two-point",  domain: "感觉/本体", description: "两点辨识觉改善",       exampleMetric: "指尖 <5mm", term: "short" },
  { id: "sensory-proprio",    domain: "感觉/本体", description: "本体感觉恢复(关节位置觉)",exampleMetric:"误差 <3°",   term: "long" },
  /* 功能/ADL */
  { id: "adl-barthel",    domain: "功能/ADL", description: "Barthel 指数提升",         exampleMetric: "60→85 分", term: "short" },
  { id: "adl-dress",      domain: "功能/ADL", description: "独立穿衣",                 exampleMetric: "独立",       term: "short" },
  { id: "adl-stairs",     domain: "功能/ADL", description: "独立上下楼",               exampleMetric: "扶手→无扶",term: "short" },
  { id: "adl-work",       domain: "功能/ADL", description: "恢复工作能力",             exampleMetric: "返岗",       term: "long" },
  { id: "adl-sport",      domain: "功能/ADL", description: "恢复运动/休闲活动",        exampleMetric: ">30 min",   term: "long" },
  /* 神经发育/发展 */
  { id: "neuro-reflex-integrate",domain: "神经发育", description: "原始反射整合",       exampleMetric: "ATNR阴性",   term: "short" },
  { id: "neuro-coordination",    domain: "神经发育", description: "协调性改善(轮替动作)", exampleMetric:"对称流畅",    term: "short" },
  { id: "neuro-attention",       domain: "神经发育", description: "专注力改善(课堂/工作)", exampleMetric:"≥30 min",  term: "long" },
  { id: "neuro-handwriting",     domain: "神经发育", description: "书写能力达标",       exampleMetric: "正常速度",    term: "long" },
  /* 自律/全身 */
  { id: "ans-sleep",      domain: "自律/全身", description: "睡眠质量改善",             exampleMetric: "≥7 h/夜",  term: "short" },
  { id: "ans-hrv",        domain: "自律/全身", description: "心率变异性(HRV)提升",     exampleMetric: "SDNN >50", term: "short" },
  { id: "ans-fatigue",    domain: "自律/全身", description: "疲劳感减轻",               exampleMetric: "VAS 疲劳 ≤3",term:"short" },
  { id: "ans-weight",     domain: "自律/全身", description: "体重达标/减重",             exampleMetric: "-5 kg",     term: "long" },
];

export const GOAL_DOMAINS = [...new Set(GOAL_TEMPLATES.map((g) => g.domain))] as string[];

/** 疗效判定 */
export type OutcomeRating =
  | "显效"
  | "有效"
  | "进步"
  | "无效"
  | "恶化";

export const OUTCOME_RATINGS: readonly OutcomeRating[] = [
  "显效", "有效", "进步", "无效", "恶化",
];

/** 治疗计划 */
export interface TreatmentPlan {
  id: string;
  encounterId: string;
  orgId: string;
  patientId: string;
  createdAt: Date;
  phase: TreatmentPhase;
  /** 频率 */
  frequency: string;
  /** 疗程 */
  duration: string;
  /** 选择的干预技术 ID 列表 */
  interventionIds: string[];
  /**
   * 逐项剂量(训练时长/组数/强度);与 interventionIds 一一对应。
   * 可选:旧 plan 可缺省,UI 不显示剂量区。
   * 全空(三个剂量字段都未填)的 ID 视为"已选但未配置剂量"。
   */
  interventionDoses?: Record<string, import("./intervention-dose").InterventionDose>;
  goals: TreatmentGoal[];
  /** 康复界限触发条件 */
  boundary?: string;
  /** 训练备注 */
  notes?: string;
}

/** 进展复评 */
export interface ProgressNote {
  id: string;
  treatmentPlanId: string;
  encounterId: string;
  orgId: string;
  patientId: string;
  createdAt: Date;
  /** 复评节点 (对应 DB horizon 列) */
  horizon: "立即" | "短期" | "长期";
  /** 疗效评级 */
  outcome?: OutcomeRating;
  /** 复评后 VAS(趋势追踪数据源) */
  vasAfter?: number;
  /** 方案调整说明 */
  adjustment?: string;
  /** 主观资料 */
  subjective?: string;
  /** 客观资料 */
  objective?: string;
  /** 评估 */
  assessment?: string;
  /** 计划 */
  plan?: string;
  /** 当前 VAS 疼痛评分 */
  vasCurrent?: number;
}
