/**
 * CSI 中枢敏感性量表(Central Sensitization Inventory) — 患者自评。
 *
 * 来源:疼痛评估量表_嵌入病历系统_V2.xlsx
 * 评分:25 项,每项 0-4 分,总分 0-100
 * 分级:0-29轻度 / 30-39中度 / 40-49重度 / ≥50极度(中枢敏化可能性高)
 * 说明:由患者自行填写,反映中枢敏化程度,不是医师打分。
 */

export const CSI_ITEM_COUNT = 25;
export const CSI_MIN = 0;
export const CSI_MAX = 4;

export type CsiSeverity = "normal" | "moderate" | "severe" | "extreme";

export function classifyCsi(total: number): CsiSeverity {
  if (total >= 50) return "extreme";
  if (total >= 40) return "severe";
  if (total >= 30) return "moderate";
  return "normal";
}

export const CSI_SEVERITY_LABELS: Record<CsiSeverity, string> = {
  normal: "轻度",
  moderate: "中度",
  severe: "重度",
  extreme: "极度（中枢敏化可能性高）",
};

export interface CsiItem {
  index: number;
  text: string;
  english: string;
}

export const CSI_ITEMS: readonly CsiItem[] = [
  { index: 1,  text: "当我从睡梦中醒来时，我感到疲倦且没有精神", english: "I feel tired and unrefreshed when I wake from sleeping" },
  { index: 2,  text: "我的肌肉感觉僵硬和酸痛",                   english: "My muscles feel stiff and achy" },
  { index: 3,  text: "我有焦虑发作",                             english: "I have anxiety attacks" },
  { index: 4,  text: "我磨牙或咬紧牙关",                         english: "I grind or clench my teeth" },
  { index: 5,  text: "我有腹泻和/或便秘的问题",                   english: "I have problems with diarrhea and/or constipation" },
  { index: 6,  text: "日常生活中，我需要他人帮助",                 english: "I need help in performing my daily activities" },
  { index: 7,  text: "我对强光敏感",                             english: "I am sensitive to bright lights" },
  { index: 8,  text: "体力活动时我很容易感到疲倦",                english: "I get tired very easily when I am physically active" },
  { index: 9,  text: "我感到全身疼痛",                           english: "I feel pain all over my body" },
  { index: 10, text: "我头痛",                                   english: "I have headaches" },
  { index: 11, text: "我感到膀胱不适，和/或小便时有灼烧感",       english: "I feel discomfort in my bladder and/or burning when I urinate" },
  { index: 12, text: "我睡不好",                                 english: "I do not sleep well" },
  { index: 13, text: "我难以集中注意力",                          english: "I have difficulty concentrating" },
  { index: 14, text: "我有皮肤问题，如干燥、瘙痒或皮疹",           english: "I have skin problems such as dryness, itchiness, or rashes" },
  { index: 15, text: "压力会让我的身体症状加重",                   english: "Stress makes my physical symptoms get worse" },
  { index: 16, text: "我感到悲伤或抑郁",                          english: "I feel sad or depressed" },
  { index: 17, text: "我精力不足",                               english: "I have low energy" },
  { index: 18, text: "我的颈部和肩部肌肉紧张",                    english: "I have muscle tension in my neck and shoulders" },
  { index: 19, text: "我的下巴疼痛",                             english: "I have pain in my jaw" },
  { index: 20, text: "某些气味，如香水，会让我感到头晕和恶心",    english: "Certain smells, such as perfumes, make me feel dizzy and nauseated" },
  { index: 21, text: "我尿频",                                   english: "I have to urinate frequently" },
  { index: 22, text: "当我晚上想睡觉时，我的双腿感到不舒服和不安", english: "My legs feel uncomfortable and restless when I am trying to go to sleep at night" },
  { index: 23, text: "我记忆力差",                               english: "I have difficulty remembering things" },
  { index: 24, text: "我小时候受过创伤",                         english: "I suffered trauma as a child" },
  { index: 25, text: "我的盆腔区域疼痛",                         english: "I have pain in my pelvic area" },
];

export const CSI_SCORE_LABELS = ["从不(0)", "罕见(1)", "有时(2)", "经常(3)", "总是(4)"];

export interface CsiScoreDescriptor {
  value: number;
  label: string;
  percent: string;
  full: string;
}

export const CSI_SCORE_DESCRIPTORS: readonly CsiScoreDescriptor[] = [
  { value: 0, label: "从不", percent: "0% 的时间",  full: "从不 (0% 的时间)" },
  { value: 1, label: "罕见", percent: "<25% 的时间", full: "罕见 (<25% 的时间)" },
  { value: 2, label: "有时", percent: "50% 的时间",  full: "有时 (50% 的时间)" },
  { value: 3, label: "经常", percent: "75% 的时间",  full: "经常 (75% 的时间)" },
  { value: 4, label: "总是", percent: "100% 的时间", full: "总是 (100% 的时间)" },
];

export function scoreCsi(items: readonly number[]): { total: number; severity: CsiSeverity } {
  if (items.length !== CSI_ITEM_COUNT) {
    throw new Error(`CSI 需要 ${CSI_ITEM_COUNT} 项,收到 ${items.length} 项`);
  }
  for (const [i, v] of items.entries()) {
    if (!Number.isInteger(v)) throw new Error(`第 ${i + 1} 项分值必须是整数,收到 ${v}`);
    if (v < CSI_MIN || v > CSI_MAX) throw new Error(`第 ${i + 1} 项分值必须在 0-4 之间,收到 ${v}`);
  }
  const total = items.reduce((s, v) => s + v, 0);
  return { total, severity: classifyCsi(total) };
}
