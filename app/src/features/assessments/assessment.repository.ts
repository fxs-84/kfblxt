import { type Entity, type Repository } from "../../lib/repository";
import { lazyPersistent } from "../../lib/storage";
import type { AssessmentRecord, AssessmentInput } from "./assessment.types";

export type AssessmentRecordRow = Omit<AssessmentRecord, "id" | "createdAt"> & Entity;

export const assessmentRepository: Repository<AssessmentRecordRow, AssessmentInput> =
  lazyPersistent<AssessmentRecordRow, AssessmentInput>("assessments", [], {
    validate: (input) => {
      if (!input.patientId) throw new Error("患者 ID 不能为空");
      if (input.type !== "brain_region") throw new Error(`暂不支持量表类型: ${input.type}`);
      return input;
    },
  });

/** 查找某患者的所有量表记录(按创建时间倒序) */
export async function findAssessmentsByPatient(patientId: string): Promise<AssessmentRecordRow[]> {
  const all = await assessmentRepository.findAll();
  return all
    .filter((a) => a.patientId === patientId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** 查找某次就诊关联的量表记录 */
export async function findAssessmentsByEncounter(encounterId: string): Promise<AssessmentRecordRow[]> {
  const all = await assessmentRepository.findAll();
  return all
    .filter((a) => a.encounterId === encounterId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}