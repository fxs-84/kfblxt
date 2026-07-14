/**
 * 治疗计划内"逐项剂量"模型。
 * 每个被选中的干预技术(训练)可独立配置训练时长、组数、强度、备注。
 * 全部字段可选;全空即视为未配置,该条目不持久化。
 *
 * 强度档为受控枚举,保证 UI 单选/筛选行为可预期。
 * note 是整条训练的备注,而非针对强度的备注。
 */

export type IntensityLevel = "轻度" | "中度" | "重度";

export const INTENSITY_LEVELS: readonly IntensityLevel[] = ["轻度", "中度", "重度"];

export interface InterventionDose {
  /** 单次训练时长(分钟);非负整数 */
  durationMin?: number;
  /** 组数;正整数 */
  sets?: number;
  /** 强度档 */
  intensity?: IntensityLevel;
  /**
   * 该条训练的特殊说明/备注(覆盖训练整体:禁忌、调整原因、特殊体位等)。
   * 非针对强度档。注意:纯空白字符串视为空,即整条训练其他字段也空时该条目丢弃。
   */
  note?: string;
}

export type InterventionDoseMap = Record<string, InterventionDose>;

export function isIntensityLevel(v: unknown): v is IntensityLevel {
  return typeof v === "string" && (INTENSITY_LEVELS as readonly string[]).includes(v);
}

function isPositiveInteger(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n > 0;
}

/**
 * 校验并规范化逐项剂量:丢弃所有有效字段为空的项、空 id 抛错、非法值抛错。
 * 输入不修改,返回新对象。
 */
export function normalizeInterventionDoses(
  input: Record<string, InterventionDose | undefined>,
): InterventionDoseMap {
  const out: InterventionDoseMap = {};
  for (const [id, dose] of Object.entries(input)) {
    if (!id) throw new Error("intervention id 不能为空");
    if (!dose) continue;

    const durationMin = dose.durationMin;
    if (durationMin !== undefined) {
      if (!Number.isInteger(durationMin) || durationMin < 0) {
        throw new Error(`durationMin 须为非负整数: ${id}=${durationMin}`);
      }
    }

    const sets = dose.sets;
    if (sets !== undefined) {
      if (!isPositiveInteger(sets)) {
        throw new Error(`sets 须为正整数: ${id}=${sets}`);
      }
    }

    const intensity = dose.intensity;
    if (intensity !== undefined && !isIntensityLevel(intensity)) {
      throw new Error(`intensity 须为 ${INTENSITY_LEVELS.join("/")} 之一: ${id}=${intensity}`);
    }

    const rawNote = dose.note;
    if (rawNote !== undefined) {
      if (typeof rawNote !== "string") {
        throw new Error(`note 须为字符串: ${id}=${typeof rawNote}`);
      }
    }
    const note = rawNote?.trim() ? rawNote.trim() : undefined;

    if (
      durationMin === undefined &&
      sets === undefined &&
      intensity === undefined &&
      note === undefined
    ) continue;

    out[id] = { durationMin, sets, intensity, note };
  }
  return out;
}
