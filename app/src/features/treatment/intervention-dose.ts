/**
 * 治疗计划内"逐项剂量"模型。
 * 每个被选中的干预技术(训练)可独立配置训练时长、组数、强度。
 * 三个字段全部可选;全空即视为未配置,该条目不持久化。
 *
 * 强度档为受控枚举,保证 UI 单选/筛选行为可预期。
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
}

export type InterventionDoseMap = Record<string, InterventionDose>;

export function isIntensityLevel(v: unknown): v is IntensityLevel {
  return typeof v === "string" && (INTENSITY_LEVELS as readonly string[]).includes(v);
}

function isPositiveInteger(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n > 0;
}

/**
 * 校验并规范化逐项剂量:丢弃三字段全空的项、空 id 抛错、非法值抛错。
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

    if (durationMin === undefined && sets === undefined && intensity === undefined) continue;

    out[id] = { durationMin, sets, intensity };
  }
  return out;
}
