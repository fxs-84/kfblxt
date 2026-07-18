/**
 * VAS 疼痛分级配色 — 统一来源。
 *
 * 三个级别：轻(0-3)绿、 中(4-6)橙、 重(7-10)红。
 * 任何需要绘制 VAS 图例/点/分带的地方请使用本模块。
 * 颜色值与 tokens.css 中的 --color-normal / --color-caution 互补独立
 * （避免和语义色撞色），专门承载 VAS 视觉语义。
 */

export const VAS_COLORS = {
  mild: "#2d9d5a",
  moderate: "#e68a00",
  severe: "#c62828",
} as const;

/** 给定 VAS 数值，返回该级别颜色。 */
export function vasColor(v: number): string {
  if (v <= 3) return VAS_COLORS.mild;
  if (v <= 6) return VAS_COLORS.moderate;
  return VAS_COLORS.severe;
}
