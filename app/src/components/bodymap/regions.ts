import { ANTERIOR_POLYS, POSTERIOR_POLYS } from "./overlay-polys";

export const EXTRA_REGIONS = ["left-hand", "right-hand", "left-foot", "right-foot"] as const;
export type ExtraRegion = (typeof EXTRA_REGIONS)[number];

/* 扁平化后的完整区域名(从覆盖多边形 Map 生成) */
const POLY_NAMES = new Set([...ANTERIOR_POLYS.keys(), ...POSTERIOR_POLYS.keys()]);
export const ALL_REGION_NAMES: readonly string[] = [...POLY_NAMES, ...EXTRA_REGIONS].sort();
export type BodyRegion = string;

/* ---- 标签 ---- */
const BASE: Record<string, string> = {
  trapezius:"斜方肌","upper-back":"上背","lower-back":"腰背",chest:"胸部",
  biceps:"肱二头肌",triceps:"肱三头肌",forearm:"前臂","back-deltoids":"后三角肌",
  "front-deltoids":"前三角肌",abs:"腹部",obliques:"腹斜肌",adductor:"内收肌",
  abductors:"外展肌",hamstring:"腘绳肌",quadriceps:"股四头肌",calves:"小腿",
  gluteal:"臀部",head:"头部",neck:"颈部",knees:"膝",
  "left-soleus":"左比目鱼肌","right-soleus":"右比目鱼肌",
  "left-hand":"左手","right-hand":"右手","left-foot":"左足","right-foot":"右足",
};

const SUB: Record<string, string> = {
  "内侧":"内侧","外侧":"外侧","中":"中",
  "左":"左","右":"右",
};

export function regionLabel(region: BodyRegion): string {
  if (BASE[region]) return BASE[region];
  // 拆分: left-quadriceps-内侧 → 左股四头肌内侧
  const parts = region.split("-");
  let side = "";
  let start = 0;
  if (parts[0] === "left") { side = "左"; start = 1; }
  else if (parts[0] === "right") { side = "右"; start = 1; }
  const baseKey = parts.slice(start).filter((p) => !SUB[p]).join("-") || parts[start];
  const sub = SUB[parts[parts.length - 1]] ?? "";
  return side + (BASE[baseKey] ?? baseKey) + sub;
}

/* ---- 手/足叠加(库不含) ---- */
export interface OverlayShape { region: ExtraRegion; points: string; }

export const OVERLAY_ANTERIOR: readonly OverlayShape[] = [
  // 前视 cx<50 是患者的右侧，cx≥50 是患者的左侧，因此左右标签与图像左右相反
  { region:"right-hand", points:"0,100 6.94,101.22 7.3,113 5,116 2,116 0,113" },
  { region:"left-hand",  points:"94.69,99.59 100,100.41 100,113 98,116 95,116 92.8,113" },
  { region:"right-foot", points:"20.82,195.51 24.90,194.69 28,201 26,204 22,204 18,201" },
  { region:"left-foot",  points:"74.69,195.51 79.59,195.51 82,201 80,204 76,204 72,201" },
];

export const OVERLAY_POSTERIOR: readonly OverlayShape[] = [
  { region:"left-hand",  points:"0,106.38 6.81,108.51 7.2,119 5,122 2,122 0,119" },
  { region:"right-hand", points:"93.19,108.94 100,106.38 100,119 98,122 95,122 92.8,119" },
  { region:"left-foot",  points:"25.53,197.02 34.04,200 32,204 30,206 27,206 24,204" },
  { region:"right-foot", points:"66.38,199.57 74.47,196.60 72,204 70,206 67,206 64,204" },
];
