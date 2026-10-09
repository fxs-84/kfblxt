import type { Sex } from "../features/patients/patient.schema";

export function calcAge(birthDate: Date, now: Date = new Date()): number {
  let age = now.getFullYear() - birthDate.getFullYear();
  const beforeBirthday =
    now.getMonth() < birthDate.getMonth() ||
    (now.getMonth() === birthDate.getMonth() && now.getDate() < birthDate.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/**
 * 年龄 → 出生日期(取「age 年前的今天」)。
 *
 * 为什么这样设计:建档时用户只报年龄(如 29 岁),没有确切生日。
 * 取「age 年前的今天」意味着假设生日就是今天,于是:
 *   - 今天 calcAge = age(与口头年龄一致)
 *   - 明年同一天 calcAge = age + 1(自动长一岁,无需维护)
 * 配合 calcAge 的显示侧实时计算,年龄永远跟日历走。
 */
export function birthDateFromAge(age: number, now: Date = new Date()): Date {
  if (!Number.isInteger(age) || age < 0 || age > 150) {
    throw new Error("年龄必须是 0-150 的整数");
  }
  const d = new Date(now);
  d.setFullYear(d.getFullYear() - age);
  return d;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export type VasSeverity = "normal" | "caution" | "abnormal";

/** VAS 0-10 严重度分档:0-3 轻 / 4-6 中 / 7-10 重。阈值待医师确认。 */
export function vasSeverity(vas: number): VasSeverity {
  if (vas <= 3) return "normal";
  if (vas <= 6) return "caution";
  return "abnormal";
}

export const SEX_LABELS: Record<Sex, string> = { male: "男", female: "女", other: "其他" };
export const HAND_LABELS: Record<"left" | "right" | "ambidextrous", string> = {
  left: "左利手",
  right: "右利手",
  ambidextrous: "双利手",
};
