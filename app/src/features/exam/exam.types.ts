/**
 * 查体引擎核心类型。
 * exam_catalog 为查体项目字典(从 ANRM 手册种子导入),
 * exam_sessions 承载一次就诊内全部查体结果,每项可记录左右双侧。
 * 所有正常值/分级待医师签字确认(任务 #6)。
 */

/** 查体大类 */
export type ExamCategory =
  | "原始反射"
  | "神经反射和病理反射"
  | "前庭-眼动"
  | "反射"
  | "感觉"
  | "小脑与平衡"
  | "步态"
  | "自律神经"
  | "肌力"
  | "量表";

export const EXAM_CATEGORIES: readonly ExamCategory[] = [
  "原始反射", "神经反射和病理反射", "前庭-眼动", "反射", "感觉",
  "小脑与平衡", "步态", "自律神经", "肌力", "量表",
];

export const CATEGORY_LABELS: Record<ExamCategory, string> = {
  "原始反射":  "原始反射",
  "神经反射和病理反射": "神经反射和病理反射",
  "前庭-眼动": "前庭-眼动",
  "反射":      "反射/肌张力",
  "感觉":      "感觉/本体感觉",
  "小脑与平衡": "小脑与平衡",
  "步态":      "步态",
  "自律神经":  "自律神经",
  "肌力":      "肌力",
  "量表":      "量表评估",
};

/** 数据类型决定渲染何种输入控件 */
export type ExamDataType =
  | "pos-neg"      // 阳性/阴性
  | "grade-0-4"    // 0-4 级(深反射/MAS)
  | "grade-0-5"    // 0-5 级(肌力 MMT)
  | "number"       // 数值(角度/cm/秒/次数)
  | "seconds"      // 时间(秒)
  | "select"       // 多选一
  | "text";         // 自由文本

/** 单条查体项目定义 */
export interface ExamItemDef {
  id: string;
  category: ExamCategory;
  name: string;
  dataType: ExamDataType;
  /** 默认双侧,个别项目单侧 */
  side: "both" | "single" | "none";
  unit?: string;
  /** select 时的选项 */
  options?: readonly string[];
  /** 子项列表(多阶段/多部位评估,渲染为列表,如 CTSIB 的 4 阶段) */
  subItems?: readonly string[];
  /** 正常参考 */
  normalRef?: string;
  /** 异常含义说明 */
  abnormalMeaning?: string;
  /** 待医师确认标记 */
  pendingConfirmation?: boolean;
}

/** 一次查体会话 */
export interface ExamSession {
  id: string;
  encounterId: string;
  orgId: string;
  createdAt: Date;
  /** 逐项结果,key = examItemDef.id */
  results: Record<string, ExamResult>;
}

/** 单项查体结果 */
export interface ExamResult {
  /** 左侧值(pos-neg 时为 boolean;grade 时为 number;select 为选中的 value) */
  left?: unknown;
  right?: unknown;
  value?: unknown; // 单侧项目
  note?: string;
  /** 多阶段子项输入(例如 CTSIB 4 阶段),key = subItems 索引 */
  stages?: Record<number, number>;
}
