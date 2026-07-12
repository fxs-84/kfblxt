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
import type { ShareSnapshot } from "./share.types";

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
    plans: plans.map((p) => ({
      id: p.id,
      phase: p.phase,
      frequency: p.frequency,
      duration: p.duration,
      interventionIds: p.interventionIds,
      goals: p.goals.map((g: { description?: string; targetDate?: string | Date; achieved?: boolean }) => (typeof g === "string" ? g : g.description ?? "")),
    })),
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
