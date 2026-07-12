import type { Entity } from "../../lib/repository";
import type {
  BrainRegionId,
  BrainRegionResponses,
  BrainRegionScore,
  PhoneEarPreference,
} from "./scales/brain-region";
import type { CsiSeverity } from "./scales/csi";
import type { SlanssResult } from "./scales/slanss";

/**
 * 大脑区域定位表记录 — 100 题 + 第46题偏好
 */
export interface BrainAssessmentRecord extends Entity {
  patientId: string;
  encounterId?: string;
  orgId: string;
  type: "brain_region";
  responses: BrainRegionResponses;
  score: BrainRegionScore;
  phoneEar: PhoneEarPreference | null;
  note?: string;
}

export interface BrainAssessmentInput {
  patientId: string;
  encounterId?: string;
  orgId: string;
  type: "brain_region";
  responses: BrainRegionResponses;
  score: BrainRegionScore;
  phoneEar: PhoneEarPreference | null;
  note?: string;
}

/**
 * CSI 25 题答卷
 */
export interface CsiResponses {
  /** key=题号 1-25,value=0-4 分 */
  items: Record<number, number>;
  total: number;
  severity: CsiSeverity;
}

/**
 * S-LANSS 7 题答卷
 */
export interface SlanssResponses {
  /** key=题号 1-7,value=该题得分(0/1/2/3/5) */
  items: Record<number, number>;
  total: number;
  positive: boolean;
}

/**
 * 疼痛评估记录(客户自评)— 组合 CSI + S-LANSS
 */
export interface PainAssessmentRecord extends Entity {
  patientId: string;
  encounterId?: string;
  orgId: string;
  type: "pain_assessment";
  csi: CsiResponses;
  slanss: SlanssResponses;
}

export interface PainAssessmentInput {
  patientId: string;
  encounterId?: string;
  orgId: string;
  type: "pain_assessment";
  csi: CsiResponses;
  slanss: SlanssResponses;
}

/** Union — 仓储可同时存两种 */
export type AssessmentRecord = BrainAssessmentRecord | PainAssessmentRecord;
export type AssessmentInput = BrainAssessmentInput | PainAssessmentInput;

// 仅持久化的子类型(Omit<…,'id'|'createdAt'> + Entity 字段)
export type BrainAssessmentRecordRow = Omit<BrainAssessmentRecord, "id" | "createdAt"> & Entity;
export type PainAssessmentRecordRow = Omit<PainAssessmentRecord, "id" | "createdAt"> & Entity;
export type AssessmentRecordRow = BrainAssessmentRecordRow | PainAssessmentRecordRow;

// 供下层引用
export type { CsiSeverity, SlanssResult };
export type { BrainRegionId, BrainRegionResponses, BrainRegionScore, PhoneEarPreference };