import { type Entity, type Repository } from "../../lib/repository"
import { lazyPersistent } from "../../lib/storage";
import type { Followup, FollowupStatus } from "./followup.types";
import { MOCK_SESSION } from "../../lib/session";

export type FollowupRecord = Omit<Followup, "id" | "createdAt"> & Entity;

export interface FollowupInput {
  patientId: string;
  orgId: string;
  dueDate: Date;
  note: string;
  status?: FollowupStatus;
  completedEncounterId?: string;
}

const P1 = "aaaaaaaa-0000-4000-8000-000000000001"; // 张伟
const P2 = "aaaaaaaa-0000-4000-8000-000000000002"; // 李娜

const seed: FollowupRecord[] = [
  { id: "f0000001-0000-4000-8000-000000000001", createdAt: new Date("2026-06-20"), patientId: P1, orgId: MOCK_SESSION.orgId, dueDate: new Date("2026-07-05"), status: "待复诊", note: "4周复诊评估,复查跟腱反射与步行能力" },
  { id: "f0000001-0000-4000-8000-000000000002", createdAt: new Date("2026-06-25"), patientId: P2, orgId: MOCK_SESSION.orgId, dueDate: new Date("2026-07-10"), status: "待复诊", note: "颈椎复查,评估前臂麻木改善情况" },
  { id: "f0000001-0000-4000-8000-000000000003", createdAt: new Date("2026-05-30"), patientId: P1, orgId: MOCK_SESSION.orgId, dueDate: new Date("2026-06-20"), status: "已完成", note: "3周复诊", completedEncounterId: "e0000001-0000-4000-8000-000000000003" },
];

export const followupRepository: Repository<FollowupRecord, FollowupInput> =
  lazyPersistent<FollowupRecord, FollowupInput>("followups", seed, { });

export async function findFollowupsByPatient(patientId: string): Promise<FollowupRecord[]> {
  const all = await followupRepository.findAll();
  return all.filter((f) => f.patientId === patientId).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

export async function findAllPending(): Promise<FollowupRecord[]> {
  const all = await followupRepository.findAll();
  return all.filter((f) => f.status === "待复诊").sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

