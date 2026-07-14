/**
 * 创建分享时快照所有临床数据,使客户在任何设备都能查看完整内容。
 *
 * PatientViewPage 原本依赖 localStorage 仓储(encounter / exam / diagnosis /
 * treatment / attachments), 但这些只存在于医生设备上。
 * 快照将所有依赖数据打入 Supabase share 记录,实现真正的跨设备分享。
 */
import { findEncountersByPatient } from "../encounters/encounter.repository";
import { findSessionsByEncounter } from "../exam/exam.repository";
import { findDiagnosisByEncounter } from "../diagnosis/diagnosis.repository";
import { findPlansByEncounter } from "../treatment/treatment.repository";
import { findAttachmentsByEncounter } from "../attachments/attachment.repository";
import type { SharePlan, ShareSnapshot } from "./share.types";
import type { TreatmentPlanRecord } from "../treatment/treatment.repository";

/**
 * 把治疗计划记录投给分享层(单一职责,纯函数,易于单元测试)。
 * - 包含逐项剂量(interventionDoses),与治疗师端 UI 一致
 * - note 在前端 UI 已存在,这里保留原样
 */
export function toSharePlan(plan: TreatmentPlanRecord): SharePlan {
  return {
    id: plan.id,
    phase: plan.phase,
    frequency: plan.frequency,
    duration: plan.duration,
    interventionIds: plan.interventionIds,
    interventionDoses: plan.interventionDoses,
    goals: plan.goals.map((g: { description?: string; targetDate?: string | Date; achieved?: boolean }) => (typeof g === "string" ? g : g.description ?? "")),
  };
}

export async function buildShareSnapshot(encounterId: string, patientId: string): Promise<ShareSnapshot> {
  const encounters = await findEncountersByPatient(patientId);
  const encounter = encounters.find((e) => e.id === encounterId) ?? null;
  const sessions = await findSessionsByEncounter(encounterId);
  const diagnosis = await findDiagnosisByEncounter(encounterId);
  const plans = await findPlansByEncounter(encounterId);
  const attachments = await findAttachmentsByEncounter(encounterId);

  return {
    encounter: encounter ? {
      encounterDate: encounter.encounterDate.toISOString(),
      visitType: encounter.visitType,
      chiefComplaint: encounter.chiefComplaint,
    } : null,
    sessions: sessions.map((s) => ({
      id: s.id,
      results: s.results,
      createdAt: s.createdAt.toISOString(),
    })),
    diagnosis: diagnosis ? {
      levels: diagnosis.levels,
      mechanisms: diagnosis.mechanisms,
      reasoning: diagnosis.reasoning,
      side: diagnosis.side,
      segments: diagnosis.segments,
      nerves: diagnosis.nerves,
      cutaneousNerveIds: diagnosis.cutaneousNerveIds,
    } : null,
    plans: plans.map(toSharePlan),
    attachments: attachments.map((a) => ({
      id: a.id,
      category: a.category,
      fileName: a.fileName,
      dataUrl: a.dataUrl,
      timeline: a.timeline,
      comparisonGroup: a.comparisonGroup,
    })),
  };
}
