/**
 * 大脑区域定位表(Brain Region Localization Form,ANRM 神经康复专科量表)。
 *
 * 来源:ANRM 内部问卷(由用户提供的 3 份 PDF 整理)
 *   - 1.说明.pdf(指导语与 0-4 分标准)
 *   - 2.顶叶下小叶(区域 39 和 40).pdf 等前 9 段
 *   - 3.小脑-脊髓小脑.pdf 等后 7 段
 *
 * 设计要点:
 *  - 16 个脑功能分区,共 100 题,每题 0-4 分(0=无症状,4=总是有症状)
 *  - 第 46 题(使用电话偏好侧)为单选(right/left/no preference),单独建模
 *  - 部分题目带 L/R 侧别提示(L=左半球主导,R=右半球主导),仅展示用,不影响总分
 *  - 各分区小计 + 总分,辅助定位"高负担区"
 *  - 分级阈值待临床医师签字确认(任务 #6)
 */

export const BRAIN_REGION_ITEM_COUNT = 100; // 题号名义上 1-100(PDF 序号)
export const BRAIN_REGION_SCORED_ITEM_COUNT = 99; // 实际可评分题:100 - 第46题(单选);#65 已补
export const BRAIN_REGION_MIN_ITEM = 0;
export const BRAIN_REGION_MAX_ITEM = 4;
export const BRAIN_REGION_MAX_TOTAL = BRAIN_REGION_SCORED_ITEM_COUNT * BRAIN_REGION_MAX_ITEM; // 396

/**
 * 评判规则(用户明确口径):
 *   每个模块按模块题目数量来判定,模块小计 ≥ 该模块满分 1/4 即"有问题";
 *   评分越高,问题越重。
 *   示例:前额叶 17 题 × 4 = 68,17/68 = 25%,即小计 ≥ 17 即有问题。
 *
 * 严重度分级(以 1/4 为粒度,便于临床医师快速判定):
 *   < 1/4          → normal  正常
 *   [1/4, 1/2)    → mild    轻度
 *   [1/2, 3/4)    → moderate 中度
 *   ≥ 3/4          → severe   重度
 */
export const AFFECTED_THRESHOLD = 0.25; // 模块小计/模块满分 ≥ 此值即"有问题"
export const MILD_THRESHOLD = 0.25;
export const MODERATE_THRESHOLD = 0.5;
export const SEVERE_THRESHOLD = 0.75;

export type RegionSeverity = "normal" | "mild" | "moderate" | "severe";

/** 模块中文标签(给 UI 用) */
export const REGION_SEVERITY_LABELS: Record<RegionSeverity, string> = {
  normal: "正常",
  mild: "轻度",
  moderate: "中度",
  severe: "重度",
};

/** 给定模块小计+满分,返回严重度分级 */
export function classifyRegionSeverity(score: number, max: number): RegionSeverity {
  if (max <= 0) return "normal";
  const ratio = score / max;
  if (ratio >= SEVERE_THRESHOLD) return "severe";
  if (ratio >= MODERATE_THRESHOLD) return "moderate";
  if (ratio >= MILD_THRESHOLD) return "mild";
  return "normal";
}

/** 16 个脑功能分区(题目区间按 PDF 顺序 1-100) */
export type BrainRegionId =
  | "prefrontal"        // 前额叶,背外侧和眶前区(9、10、11、12)
  | "premotor"          // 额叶中央前区和辅助运动区(4、6)
  | "broca"             // 额叶布罗卡区运动言语区(44、45)
  | "somatosensory"     // 顶叶体感区和顶叶上小叶(3、1、2、7)
  | "parietalInferior"  // 顶叶下小叶(39、40)
  | "auditoryCortex"    // 颞叶听觉皮层(41、42)
  | "auditoryAssoc"     // 颞叶听觉联合皮层(22)
  | "medialTemporal"    // 内侧颞叶和海马体
  | "occipital"         // 枕叶(17、18、19)
  | "cerebellumSpinal"  // 小脑 - 脊髓小脑
  | "cerebellumCortex"  // 小脑 - 皮层小脑
  | "cerebellumVest"    // 小脑 - 前庭小脑
  | "basalDirect"       // 基底节直接通路
  | "basalIndirect"     // 基底节间接通路
  | "parasympathetic"   // 副交感神经活动减少
  | "sympathetic";      // 交感神经活动增加

export interface BrainRegionDef {
  id: BrainRegionId;
  /** 中文短名 */
  label: string;
  /** 含脑区编号说明 */
  detail: string;
  /** 题目在原始量表中起止号(包含) */
  range: readonly [number, number];
}

export const BRAIN_REGION_DEFS: readonly BrainRegionDef[] = [
  { id: "prefrontal",       label: "前额叶,背外侧和眶前区", detail: "区域 9、10、11、12",     range: [1, 17] },
  { id: "premotor",         label: "额叶中央前区、辅助运动区", detail: "区域 4、6",             range: [18, 23] },
  { id: "broca",            label: "额叶布罗卡区运动言语区",   detail: "区域 44、45",          range: [24, 26] },
  { id: "somatosensory",    label: "顶叶体感区、顶叶上小叶",   detail: "区域 3、1、2、7",     range: [27, 31] },
  { id: "parietalInferior", label: "顶叶下小叶",                detail: "区域 39、40",          range: [32, 38] },
  { id: "auditoryCortex",   label: "颞叶听觉皮层",              detail: "区域 41、42",          range: [39, 46] },
  { id: "auditoryAssoc",    label: "颞叶听觉联合皮层",          detail: "区域 22",              range: [47, 48] },
  { id: "medialTemporal",   label: "内侧颞叶和海马体",          detail: "",                     range: [49, 61] },
  { id: "occipital",        label: "枕叶",                       detail: "区域 17、18、19",     range: [62, 66] },
  { id: "cerebellumSpinal", label: "小脑 - 脊髓小脑",           detail: "",                     range: [67, 70] },
  { id: "cerebellumCortex", label: "小脑 - 皮层小脑",           detail: "",                     range: [71, 73] },
  { id: "cerebellumVest",   label: "小脑 - 前庭小脑",           detail: "",                     range: [74, 79] },
  { id: "basalDirect",      label: "基底节直接通路",            detail: "",                     range: [80, 85] },
  { id: "basalIndirect",    label: "基底节间接通路",            detail: "",                     range: [86, 89] },
  { id: "parasympathetic",  label: "副交感神经活动减少",        detail: "",                     range: [90, 94] },
  { id: "sympathetic",      label: "交感神经活动增加",          detail: "",                     range: [95, 100] },
];

export type Hemisphere = "L" | "R" | null;

/** 量表单项定义 */
export interface BrainRegionItem {
  /** 题号 1-100 */
  index: number;
  /** 题干(精简后) */
  text: string;
  /** 半球倾向(L=左半球主控,R=右半球主控) */
  side?: Hemisphere;
}

/** 第 46 题专用:三选一 */
export type PhoneEarPreference = "right" | "left" | "no_preference";

/** 单次问卷填写响应 */
export interface BrainRegionResponses {
  /** 100 道 0-4 题答卷,key 为题号(1-100);未作答为 undefined */
  items: Record<number, number>;
  /** 第 46 题偏好侧(独立字段) */
  phoneEar: PhoneEarPreference | null;
}

/** 分区小计结果 */
export interface BrainRegionScore {
  /** 分区 ID → 该区题目得分合计 */
  byRegion: Record<BrainRegionId, number>;
  /** 全表总分(仅供参考,不作判定依据) */
  total: number;
  /** 总分占满分的百分比(0-100,仅供参考) */
  percent: number;
  /** 有问题的分区(模块小计 ≥ 模块满分 1/4,即"轻度"及以上) */
  affectedRegions: BrainRegionId[];
  /** 每个分区的严重度 */
  severityByRegion: Record<BrainRegionId, RegionSeverity>;
}

/** 题目全集(按 PDF 抄录,顺序与题号一致) */
export const BRAIN_REGION_ITEMS: readonly BrainRegionItem[] = [
  // 1. 前额叶(1-17)
  { index: 1,  text: "难以约束和控制冲动或欲望", side: null },
  { index: 2,  text: "情绪不稳定", side: null },
  { index: 3,  text: "规划和组织的困难", side: null },
  { index: 4,  text: "做决定的困难", side: null },
  { index: 5,  text: "缺乏动机、热情、兴趣和驱动力(冷漠)", side: null },
  { index: 6,  text: "难以将头脑中的声音或旋律摆脱", side: null },
  { index: 7,  text: "持续重复事情或思想,难以放下", side: null },
  { index: 8,  text: "开始和完成任务的困难", side: null },
  { index: 9,  text: "抑郁的发作", side: null },
  { index: 10, text: "精神上的疲惫", side: null },
  { index: 11, text: "注意力持续时间减少", side: null },
  { index: 12, text: "难以长时间保持专注和集中注意力", side: null },
  { index: 13, text: "创造性、想象力和直觉方面的困难", side: "R" },
  { index: 14, text: "难以欣赏艺术和音乐", side: "R" },
  { index: 15, text: "分析性思维的困难", side: "L" },
  { index: 16, text: "在数学、数字技能和时间意识方面的困难", side: "L" },
  { index: 17, text: "难以将想法、行动和言语按线性顺序组织起来", side: "L" },

  // 2. 额叶中央前区(18-23)
  { index: 18, text: "启动您的手臂或腿的动作变得更加困难", side: null },
  { index: 19, text: "感觉手臂或腿沉重,尤其是疲倦时", side: null },
  { index: 20, text: "手臂或腿的肌肉紧绷增加", side: null },
  { index: 21, text: "手臂或腿的肌肉耐力减弱", side: null },
  { index: 22, text: "一侧与另一侧的肌肉功能或力量明显差异", side: null },
  { index: 23, text: "一侧与另一侧的肌肉紧绷程度有明显差异", side: null },

  // 3. 布罗卡区(24-26)
  { index: 24, text: "口头表达组词有困难,尤其是疲劳时", side: "L" },
  { index: 25, text: "发现说话有时变得很困难", side: "L" },
  { index: 26, text: "有时注意到语句的发音和说话的流畅性发生变化", side: "L" },

  // 4. 顶叶体感区(27-31)
  { index: 27, text: "感知肢体位置的困难", side: null },
  { index: 28, text: "移动、后仰在椅子上或倚靠墙壁时难以评估后方的距离", side: null },
  { index: 29, text: "经常不小心地撞到墙或物体上", side: null },
  { index: 30, text: "同一部位或身体的一侧反复受伤", side: null },
  { index: 31, text: "对触摸或疼痛的过度敏感", side: null },

  // 5. 顶叶下小叶(32-38)
  { index: 32, text: "难以区分左/右", side: "L" },
  { index: 33, text: "数学计算的困难", side: "L" },
  { index: 34, text: "找词困难", side: "L" },
  { index: 35, text: "写作困难", side: "L" },
  { index: 36, text: "难以识别符号或形状", side: "R" },
  { index: 37, text: "简单绘画的困难", side: "R" },
  { index: 38, text: "解读地图的困难", side: "R" },

  // 6. 颞叶听觉皮层(39-46)
  { index: 39, text: "总体听力功能降低", side: null },
  { index: 40, text: "在背景噪音中难以理解言语", side: null },
  { index: 41, text: "难以理解非完美发音的语言", side: null },
  { index: 42, text: "需要看着某人的嘴巴才能理解他们在说什么", side: null },
  { index: 43, text: "定位声音的方位困难", side: null },
  { index: 44, text: "不喜欢预测性的、重复的节奏和节拍音乐", side: "L" },
  { index: 45, text: "不喜欢使用多种乐器的不可预测的节奏", side: "R" },
  // 第 46 题是三选一,不放进 0-4 答卷
  { index: 46, text: "使用电话时明显偏好一侧耳朵", side: null },

  // 7. 颞叶听觉联合皮层(47-48)
  { index: 47, text: "难以理解一些接地气的词语的意义", side: "L" },
  { index: 48, text: "倾向于单调的言语,没有起伏或情感", side: "R" },

  // 8. 内侧颞叶和海马体(49-61)
  { index: 49, text: "记忆效率降低", side: null },
  { index: 50, text: "影响日常活动的记忆丧失", side: null },
  { index: 51, text: "对日期、时间流逝或地点感到困惑", side: null },
  { index: 52, text: "难以回忆事件", side: null },
  { index: 53, text: "东西容易放错地方并难以回忆经过", side: null },
  { index: 54, text: "记忆地点(如地址)的困难", side: "R" },
  { index: 55, text: "视觉记忆的困难", side: "R" },
  { index: 56, text: "常常忘记放置的物品,如钥匙、钱包、手机等", side: "R" },
  { index: 57, text: "难以记住面孔", side: "R" },
  { index: 58, text: "难以将名字与面孔联系起来", side: "L" },
  { index: 59, text: "记忆单词的困难", side: "L" },
  { index: 60, text: "记忆数字的困难", side: "L" },
  { index: 61, text: "难以记住准时或按时做事", side: "L" },

  // 9. 枕叶(62-66)
  { index: 62, text: "难以区分相似的颜色深浅", side: null },
  { index: 63, text: "看见物品的色彩变得暗淡", side: null },
  { index: 64, text: "难以协调视觉输入和手部动作,导致无法有效地伸手取物", side: null },
  { index: 65, text: "视野中出现局部暗点或盲区(视野缺损)", side: null },
  { index: 66, text: "视野中出现飞蚊症或光晕", side: null },

  // 10. 小脑 - 脊髓小脑(67-70)
  { index: 67, text: "平衡困难、或一侧的平衡更差", side: null },
  { index: 68, text: "下楼时需要抓住扶手或小心翼翼地观察每一步", side: null },
  { index: 69, text: "在黑暗中感觉不稳、容易摔倒", side: null },
  { index: 70, text: "行走或站立时身体倾向于倚向一侧", side: null },

  // 11. 小脑 - 皮层小脑(71-73)
  { index: 71, text: "最近手部变得笨拙", side: null },
  { index: 72, text: "最近脚部变得笨拙或经常绊倒", side: null },
  { index: 73, text: "在动作的最后阶段伸手去取东西时手微微颤抖", side: null },

  // 12. 小脑 - 前庭小脑(74-79)
  { index: 74, text: "头晕或方向感丧失的发作", side: null },
  { index: 75, text: "站立或行走时背部肌肉很快疲劳", side: null },
  { index: 76, text: "长期颈部或背部肌肉紧绷", side: null },
  { index: 77, text: "感到恶心、晕车或晕船", side: null },
  { index: 78, text: "感觉方向感丧失或环境在移动", side: null },
  { index: 79, text: "人多的地方引发焦虑", side: null },

  // 13. 基底节直接通路(80-85)
  { index: 80, text: "动作缓慢", side: null },
  { index: 81, text: "肌肉(不是关节)僵硬,但在移动时会消失", side: null },
  { index: 82, text: "写字时手抽筋", side: null },
  { index: 83, text: "行走时身体前倾", side: null },
  { index: 84, text: "声音变得更加微弱", side: null },
  { index: 85, text: "面部表情变化,导致人们经常问你是否不高兴或生气", side: null },

  // 14. 基底节间接通路(86-89)
  { index: 86, text: "无法控制的肌肉运动", side: null },
  { index: 87, text: "强烈的需要经常清嗓子或收缩一组肌肉", side: null },
  { index: 88, text: "强迫症倾向", side: null },
  { index: 89, text: "持续的神经紧张和心神不宁", side: null },

  // 15. 副交感神经活动减少(90-94)
  { index: 90, text: "口干或眼干", side: null },
  { index: 91, text: "吞咽补品或大块食物困难", side: null },
  { index: 92, text: "肠道动作缓慢,容易便秘", side: null },
  { index: 93, text: "慢性消化不良", side: null },
  { index: 94, text: "肠或膀胱失禁,导致内裤污渍", side: null },

  // 16. 交感神经活动增加(95-100)
  { index: 95, text: "容易焦虑", side: null },
  { index: 96, text: "容易受惊", side: null },
  { index: 97, text: "放松困难", side: null },
  { index: 98, text: "对明亮或闪烁的灯光敏感", side: null },
  { index: 99, text: "心跳加速的发作", side: null },
  { index: 100, text: "睡眠困难", side: null },
];

/** 第 46 题选项 */
export const PHONE_EAR_OPTIONS: ReadonlyArray<{ value: PhoneEarPreference; label: string }> = [
  { value: "right", label: "右耳" },
  { value: "left", label: "左耳" },
  { value: "no_preference", label: "无明显偏好" },
];

/** 给定题号,定位所属分区 */
export function findRegionForItem(index: number): BrainRegionDef | null {
  for (const def of BRAIN_REGION_DEFS) {
    if (index >= def.range[0] && index <= def.range[1]) return def;
  }
  return null;
}

/**
 * 计算分数。
 * - 校验 0-4 整数
 * - 第 46 题不计入总分(单选偏好侧,独立展示)
 * - 按模块(分区)判定问题,阈值 = 该模块满分 1/4
 *   全表总分/百分比仅作参考,不作判定依据
 */
export function scoreBrainRegion(responses: BrainRegionResponses): BrainRegionScore {
  const items = responses.items;
  const byRegion: Record<BrainRegionId, number> = {} as Record<BrainRegionId, number>;
  const severityByRegion: Record<BrainRegionId, RegionSeverity> = {} as Record<BrainRegionId, RegionSeverity>;
  for (const def of BRAIN_REGION_DEFS) {
    byRegion[def.id] = 0;
    severityByRegion[def.id] = "normal";
  }

  for (const item of BRAIN_REGION_ITEMS) {
    const raw = items[item.index];
    if (raw === undefined) continue;
    if (!Number.isInteger(raw)) {
      throw new Error(`第 ${item.index} 题分值必须是整数,收到 ${raw}`);
    }
    if (raw < BRAIN_REGION_MIN_ITEM || raw > BRAIN_REGION_MAX_ITEM) {
      throw new Error(`第 ${item.index} 题分值必须在 0-4 之间,收到 ${raw}`);
    }
    // 第 46 题不进总分
    if (item.index === 46) continue;
    const def = findRegionForItem(item.index);
    if (!def) continue;
    byRegion[def.id] += raw;
  }

  const total = Object.values(byRegion).reduce((s, v) => s + v, 0);
  const percent = Math.round((total / BRAIN_REGION_MAX_TOTAL) * 1000) / 10;

  // 按模块判定:每个分区独立计算小计 / 满分,达 1/4 即"有问题"
  const affectedRegions: BrainRegionId[] = [];
  for (const def of BRAIN_REGION_DEFS) {
    const max = regionMaxScore(def);
    if (max <= 0) continue;
    const severity = classifyRegionSeverity(byRegion[def.id], max);
    severityByRegion[def.id] = severity;
    if (byRegion[def.id] / max >= AFFECTED_THRESHOLD) {
      affectedRegions.push(def.id);
    }
  }

  return { byRegion, total, percent, affectedRegions, severityByRegion };
}

/** 给定区间,计算实际可评分题目数(排除第 46 题 + 区间内未列出的题号) */
export function scorableItemCountForRange(range: readonly [number, number]): number {
  let count = 0;
  for (const item of BRAIN_REGION_ITEMS) {
    if (item.index === 46) continue;
    if (item.index >= range[0] && item.index <= range[1]) count++;
  }
  return count;
}

/** 分区满分(可评分题数 × 4),用于 UI 进度条 */
export function regionMaxScore(def: BrainRegionDef): number {
  return scorableItemCountForRange(def.range) * BRAIN_REGION_MAX_ITEM;
}