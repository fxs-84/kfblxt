/**
 * Berg 平衡量表(Berg Balance Scale)计分。
 * 14 个功能性动作,每项 0-4 分,总分 0-56。分数越高平衡越好。
 * 跌倒风险分级阈值待临床医师签字确认(任务 #6)。
 */
export const BERG_ITEM_COUNT = 14;
export const BERG_MIN_ITEM = 0;
export const BERG_MAX_ITEM = 4;

export type FallRisk = "low" | "moderate" | "high";

export interface BergResult {
  total: number;
  risk: FallRisk;
}

function classifyRisk(total: number): FallRisk {
  if (total >= 41) return "low";
  if (total >= 21) return "moderate";
  return "high";
}

export function scoreBerg(items: readonly number[]): BergResult {
  if (items.length !== BERG_ITEM_COUNT) {
    throw new Error(`Berg 量表需要 ${BERG_ITEM_COUNT} 项,收到 ${items.length} 项`);
  }
  for (const [index, value] of items.entries()) {
    if (!Number.isInteger(value)) {
      throw new Error(`第 ${index + 1} 项分值必须是整数,收到 ${value}`);
    }
    if (value < BERG_MIN_ITEM || value > BERG_MAX_ITEM) {
      throw new Error(`第 ${index + 1} 项分值必须在 0-4 之间,收到 ${value}`);
    }
  }
  const total = items.reduce((sum, value) => sum + value, 0);
  return { total, risk: classifyRisk(total) };
}
