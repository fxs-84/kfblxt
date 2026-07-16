import { type Entity, type Repository } from "../../lib/repository"
import { lazyPersistent } from "../../lib/storage";
import type { ExamSession, ExamResult } from "./exam.types";

export type ExamSessionRecord = Omit<ExamSession, "id" | "createdAt"> & Entity;

export interface ExamSessionInput {
  encounterId: string;
  orgId: string;
  patientId: string;
  results: Record<string, ExamResult>;
}

export const examSessionRepository: Repository<ExamSessionRecord, ExamSessionInput> =
  lazyPersistent<ExamSessionRecord, ExamSessionInput>("exam-sessions", [], {
    validate: (input) => {
      if (!input.encounterId) throw new Error("就诊 ID 不能为空");
      return input;
    },
  });

/** 查找某次就诊的所有查体会话 */
export async function findSessionsByEncounter(encounterId: string): Promise<ExamSessionRecord[]> {
  const all = await examSessionRepository.findAll();
  return all
    .filter((s) => s.encounterId === encounterId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** 查找某次就诊最新一次查体 */
export async function findLatestSession(encounterId: string): Promise<ExamSessionRecord | null> {
  const sessions = await findSessionsByEncounter(encounterId);
  return sessions[0] ?? null;
}
