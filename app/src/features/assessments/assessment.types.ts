import type { Entity } from "../../lib/repository";
import type {
  BrainRegionId,
  BrainRegionResponses,
  BrainRegionScore,
  PhoneEarPreference,
} from "./scales/brain-region";

/**
 * 量表评估持久化记录(目前仅承载大脑区域定位表)。
 * 后续可扩展 Berg、Fugl-Meyer、MoCA 等通用结构。
 * mock 阶段用 localStorage,接 DB 时拆为多张表。
 */
export interface AssessmentRecord extends Entity {
  /** 患者 ID */
  patientId: string;
  /** 关联就诊 ID(可选 — 允许患者整体筛查) */
  encounterId?: string;
  /** 机构 ID */
  orgId: string;
  /** 量表类型(目前固定 brain_region) */
  type: "brain_region";
  /** 答卷 */
  responses: BrainRegionResponses;
  /** 计分结果(冗余存储,避免每次重建) */
  score: BrainRegionScore;
  /** 第 46 题偏好侧(冗余,便于展示) */
  phoneEar: PhoneEarPreference | null;
  /** 备注(治疗师补充) */
  note?: string;
}

export interface AssessmentInput {
  patientId: string;
  encounterId?: string;
  orgId: string;
  type: "brain_region";
  responses: BrainRegionResponses;
  score: BrainRegionScore;
  phoneEar: PhoneEarPreference | null;
  note?: string;
}

export type { BrainRegionId, BrainRegionResponses, BrainRegionScore, PhoneEarPreference };