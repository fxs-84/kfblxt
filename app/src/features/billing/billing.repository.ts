import { type Entity, type Repository } from "../../lib/repository"
import { lazyPersistent } from "../../lib/storage";
import { MOCK_SESSION } from "../../lib/session";
import type { BillingRecord, BillingType } from "./billing.types";

export type BillingRecordEntity = Omit<BillingRecord, "id" | "createdAt"> & Entity;

export interface BillingInput {
  patientId: string;
  orgId: string;
  type: BillingType;
  amount: number;
  sessions?: number;
  note: string;
  encounterId?: string;
}

const P1 = "aaaaaaaa-0000-4000-8000-000000000001"; // 张伟

const seed: BillingRecordEntity[] = [
  {
    id: "b0000001-0000-4000-8000-000000000001",
    createdAt: new Date("2026-05-20"),
    patientId: P1, orgId: MOCK_SESSION.orgId,
    type: "充值", amount: 3000, sessions: 10,
    note: "购10次康复卡(首诊优惠)",
  },
  {
    id: "b0000001-0000-4000-8000-000000000002",
    createdAt: new Date("2026-05-20"),
    patientId: P1, orgId: MOCK_SESSION.orgId,
    type: "消费", amount: 300, sessions: 1,
    note: "初诊评估+神经脱敏+VOR训练",
    encounterId: "e0000001-0000-4000-8000-000000000001",
  },
  {
    id: "b0000001-0000-4000-8000-000000000003",
    createdAt: new Date("2026-06-03"),
    patientId: P1, orgId: MOCK_SESSION.orgId,
    type: "消费", amount: 300, sessions: 1,
    note: "复诊:跟腱反射+拉伸+运动康复",
    encounterId: "e0000001-0000-4000-8000-000000000002",
  },
  {
    id: "b0000001-0000-4000-8000-000000000004",
    createdAt: new Date("2026-06-20"),
    patientId: P1, orgId: MOCK_SESSION.orgId,
    type: "消费", amount: 300, sessions: 1,
    note: "复诊:步行训练+平衡训练",
    encounterId: "e0000001-0000-4000-8000-000000000003",
  },
];

export const billingRepository: Repository<BillingRecordEntity, BillingInput> =
  lazyPersistent<BillingRecordEntity, BillingInput>("billings", seed, {
    validate: (input) => {
      if (input.amount <= 0) throw new Error("金额必须大于 0");
      if (!input.note.trim()) throw new Error("备注不能为空");
      return input;
    },
  });

export async function findBillingByPatient(patientId: string): Promise<BillingRecordEntity[]> {
  const all = await billingRepository.findAll();
  return all
    .filter((b) => b.patientId === patientId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** 计算余额:充值总额 - 消费/退费总额 */
export function calcBalance(records: readonly BillingRecordEntity[]): {
  balance: number;
  totalRecharge: number;
  totalSpent: number;
  sessionBalance: number;
  totalSessions: number;
  usedSessions: number;
} {
  let totalRecharge = 0, totalSpent = 0;
  let totalSessions = 0, usedSessions = 0;
  for (const r of records) {
    if (r.type === "充值") {
      totalRecharge += r.amount;
      if (r.sessions) totalSessions += r.sessions;
    } else {
      totalSpent += r.amount;
      if (r.type === "消费" && r.sessions) usedSessions += r.sessions;
    }
  }
  return {
    balance: totalRecharge - totalSpent,
    totalRecharge,
    totalSpent,
    sessionBalance: totalSessions - usedSessions,
    totalSessions,
    usedSessions,
  };
}
