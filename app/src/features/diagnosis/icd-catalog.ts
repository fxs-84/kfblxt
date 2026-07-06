/**
 * ICD-10 神经康复常用诊断数据集(精简版)。
 * 仅收录 ANRM 常见疾病,用户也可手动输入任意 ICD 编码。
 */
export interface ICDEntry {
  code: string;          // ICD-10 编码
  name: string;          // 中文名
  category: string;      // 章节
}

export const ICD_CATALOG: ICDEntry[] = [
  // 脊柱/椎间盘
  { code: "M51.2", name: "腰椎间盘突出(伴神经根病)", category: "脊柱" },
  { code: "M50.2", name: "颈椎间盘突出", category: "脊柱" },
  { code: "M54.5", name: "腰背痛", category: "脊柱" },
  { code: "M54.2", name: "颈痛", category: "脊柱" },
  { code: "M54.1", name: "神经根病", category: "脊柱" },
  { code: "M47.8", name: "脊柱骨关节病", category: "脊柱" },
  { code: "M48.0", name: "椎管狭窄", category: "脊柱" },
  { code: "M43.1", name: "脊椎滑脱", category: "脊柱" },
  { code: "M53.1", name: "颈臂综合征", category: "脊柱" },
  { code: "M54.6", name: "胸椎神经根炎", category: "脊柱" },

  // 神经卡压 / 周围神经
  { code: "G56.0", name: "腕管综合征", category: "神经卡压" },
  { code: "G56.1", name: "尺神经病(肘管综合征)", category: "神经卡压" },
  { code: "G56.2", name: "肘部尺神经病变", category: "神经卡压" },
  { code: "G57.0", name: "坐骨神经病变", category: "神经卡压" },
  { code: "G57.1", name: "感觉异常性股痛(Meralgia paresthetica)", category: "神经卡压" },
  { code: "G57.3", name: "腓神经病变", category: "神经卡压" },
  { code: "G57.5", name: "跗管综合征", category: "神经卡压" },
  { code: "G58.8", name: "肋间神经病变", category: "神经卡压" },
  { code: "G58.9", name: "单神经病,未特指", category: "神经卡压" },

  // 头痛
  { code: "G44.1", name: "血管性头痛", category: "头痛" },
  { code: "G44.2", name: "紧张型头痛", category: "头痛" },
  { code: "G43.9", name: "偏头痛,未特指", category: "头痛" },
  { code: "G44.8", name: "其他特指的头痛综合征", category: "头痛" },

  // 神经病变 / 疼痛
  { code: "G60.9", name: "遗传性神经病,未特指", category: "神经病变" },
  { code: "G62.9", name: "多发性神经病,未特指", category: "神经病变" },
  { code: "G62.0", name: "药物性多神经病", category: "神经病变" },
  { code: "R52.1", name: "慢性顽固性疼痛", category: "疼痛" },
  { code: "R52.2", name: "其他慢性疼痛", category: "疼痛" },
  { code: "G89.4", name: "慢性疼痛综合征", category: "疼痛" },

  // 中枢神经
  { code: "G81.9", name: "偏瘫,未特指(脑卒中后遗症)", category: "中枢" },
  { code: "I63.9", name: "脑梗死,未特指", category: "中枢" },
  { code: "I61.9", name: "脑出血,未特指", category: "中枢" },
  { code: "G35", name: "多发性硬化", category: "中枢" },
  { code: "G20", name: "帕金森病", category: "中枢" },
  { code: "G40.9", name: "癫痫,未特指", category: "中枢" },
  { code: "G82.2", name: "截瘫", category: "中枢" },
  { code: "G82.5", name: "四肢瘫", category: "中枢" },
  { code: "G93.4", name: "脑病,未特指", category: "中枢" },
  { code: "G93.3", name: "病毒性脑炎后遗症", category: "中枢" },

  // 关节/软组织
  { code: "M75.1", name: "肩袖综合征", category: "关节" },
  { code: "M75.5", name: "肩关节滑囊炎", category: "关节" },
  { code: "M75.0", name: "肩关节周围炎(冻结肩)", category: "关节" },
  { code: "M76.6", name: "跟腱炎", category: "关节" },
  { code: "M77.1", name: "外上髁炎(网球肘)", category: "关节" },
  { code: "M77.0", name: "内上髁炎(高尔夫肘)", category: "关节" },
  { code: "M79.1", name: "肌痛", category: "关节" },
  { code: "M79.3", name: "肌腱炎,未特指", category: "关节" },
  { code: "M17.9", name: "膝关节骨关节病", category: "关节" },
  { code: "M19.9", name: "关节病,未特指", category: "关节" },
  { code: "M25.5", name: "关节痛", category: "关节" },
  { code: "M62.8", name: "肌筋膜疼痛综合征", category: "关节" },

  // 软组织损伤
  { code: "S39.0", name: "腰骶部肌肉软组织损伤", category: "外伤" },
  { code: "S43.4", name: "肩关节扭伤", category: "外伤" },
  { code: "S83.5", name: "膝关节韧带扭伤", category: "外伤" },
  { code: "S93.4", name: "踝关节扭伤", category: "外伤" },
  { code: "S13.4", name: "颈椎韧带扭伤(挥鞭伤)", category: "外伤" },
  { code: "T09.5", name: "躯干多部位软组织损伤", category: "外伤" },

  // 眩晕/前庭
  { code: "H81.4", name: "中枢性眩晕", category: "眩晕" },
  { code: "H81.1", name: "良性阵发性位置性眩晕(BPPV)", category: "眩晕" },
  { code: "H81.2", name: "前庭神经炎", category: "眩晕" },
  { code: "R42", name: "头晕和眩晕", category: "眩晕" },

  // 颅神经
  { code: "G50.0", name: "三叉神经痛", category: "颅神经" },
  { code: "G50.1", name: "非典型性面痛", category: "颅神经" },
  { code: "G51.0", name: "贝尔面瘫", category: "颅神经" },

  // 发育/姿势
  { code: "Q68.8", name: "先天性姿势畸形", category: "发育" },
  { code: "M40.0", name: "姿势性脊柱后凸", category: "发育" },
  { code: "M41.9", name: "脊柱侧凸,未特指", category: "发育" },

  // 心理/睡眠
  { code: "F32.1", name: "中度抑郁发作", category: "心理" },
  { code: "F41.1", name: "广泛性焦虑障碍", category: "心理" },
  { code: "G47.0", name: "失眠症", category: "心理" },

  // 功能障碍
  { code: "R26.0", name: "共济失调步态", category: "功能障碍" },
  { code: "R26.8", name: "其他异常步态和运动障碍", category: "功能障碍" },
  { code: "R26.2", name: "行走困难", category: "功能障碍" },
  { code: "R47.0", name: "言语障碍", category: "功能障碍" },
  { code: "R13.0", name: "吞咽困难", category: "功能障碍" },
];

export function searchICD(query: string, limit = 20): ICDEntry[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase().trim();
  return ICD_CATALOG
    .filter(e =>
      e.code.toLowerCase().includes(q) ||
      e.name.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q),
    )
    .slice(0, limit);
}

export function getICDByCode(code: string): ICDEntry | null {
  return ICD_CATALOG.find(e => e.code.toLowerCase() === code.toLowerCase()) ?? null;
}

export const ICD_CATEGORIES = Array.from(new Set(ICD_CATALOG.map(e => e.category)));