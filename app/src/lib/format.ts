import type { Sex } from "../features/patients/patient.schema";

export function calcAge(birthDate: Date, now: Date = new Date()): number {
  let age = now.getFullYear() - birthDate.getFullYear();
  const beforeBirthday =
    now.getMonth() < birthDate.getMonth() ||
    (now.getMonth() === birthDate.getMonth() && now.getDate() < birthDate.getDate());
  if (beforeBirthday) age -= 1;
  return age;
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
