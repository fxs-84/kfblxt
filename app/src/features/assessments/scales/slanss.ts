/**
 * S-LANSS 利兹神经病理性疼痛自评量表 — 客户自评。
 *
 * 来源:疼痛评估量表_嵌入病历系统_V2.xlsx
 * 评分:7 项,每项二选一(否/是),分值因题而异(0/1/2/3/5)
 * 总分 0-24,阈值 ≥12 提示神经病理性疼痛
 * 说明:由客户自行填写,不是医师打分。
 */

export const SLANSS_ITEM_COUNT = 7;
export const SLANSS_THRESHOLD = 12;

export interface SlanssItem {
  index: number;
  question: string;
  /** 选项文本 */
  options: readonly [string, string];
  /** 分值:no=负极, yes=正极 */
  scores: readonly [number, number];
}

export const SLANSS_ITEMS: readonly SlanssItem[] = [
  {
    index: 1,
    question: '疼痛区域，是否也有"针刺感"、发麻感或刺痛感？',
    options: ["否，我没有这些感觉", "是，我有这些感觉"],
    scores: [0, 5],
  },
  {
    index: 2,
    question: "当疼痛特别严重时，疼痛区域肤色是否会改变（斑驳或发红）？",
    options: ["否，疼痛不会影响我的肤色", "是，疼痛让我的皮肤看起来与正常皮肤不同"],
    scores: [0, 5],
  },
  {
    index: 3,
    question: "你的疼痛区皮肤是否对轻触异常敏感？（轻抚摸时感到不适或疼痛）",
    options: ["否，不会使皮肤对触摸异常敏感", "是，皮肤对触摸特别敏感"],
    scores: [0, 3],
  },
  {
    index: 4,
    question: "当你处于完全安静状态时，疼痛会不会毫无理由地突然爆发？（电击痛/跳痛/爆炸痛）",
    options: ["否，我的疼痛并不是这样的", "是，我经常有这种感觉"],
    scores: [0, 2],
  },
  {
    index: 5,
    question: "疼痛处皮肤会不会感觉像烧灼一样的异常热痛？",
    options: ["否，我没有灼痛感", "是，我经常有灼痛感"],
    scores: [0, 1],
  },
  {
    index: 6,
    question: "用食指轻轻摩擦疼痛区域，再摩擦非疼痛区域。痛处有何感觉？",
    options: ["痛处和非痛处感觉没什么不同", "与非痛处不同，感到不适、针刺痛或灼热感"],
    scores: [0, 5],
  },
  {
    index: 7,
    question: "用指尖轻轻按压疼痛部位，再按压非疼痛部位。感觉如何？",
    options: ["痛区与非痛区感觉没什么不同", "痛处麻木或压痛，与非痛处不同"],
    scores: [0, 3],
  },
];

export type SlanssResult = "negative" | "positive";

/** 总分:每项选"是"得对应分值(5/5/3/2/1/5/3),选"否"得 0 */
export function scoreSlanss(items: readonly number[]): { total: number; result: SlanssResult } {
  if (items.length !== SLANSS_ITEM_COUNT) {
    throw new Error(`S-LANSS 需要 ${SLANSS_ITEM_COUNT} 项,收到 ${items.length} 项`);
  }
  for (const [i, v] of items.entries()) {
    const allowed = SLANSS_ITEMS[i].scores;
    if (v !== allowed[0] && v !== allowed[1]) {
      throw new Error(`第 ${i + 1} 项分值必须为 ${allowed[0]} 或 ${allowed[1]},收到 ${v}`);
    }
  }
  const total = items.reduce((s, v) => s + v, 0);
  return { total, result: total >= SLANSS_THRESHOLD ? "positive" : "negative" };
}
