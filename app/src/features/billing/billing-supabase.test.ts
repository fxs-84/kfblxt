import { describe, it, expect, beforeEach } from "vitest";
import { billingRepository, calcBalance } from "./billing.repository";
import {
  findBillingByPatientDual,
  findBillingByEncounterDual,
  createBillingDual,
  deleteBillingDual,
} from "./billing-supabase";

const ORG = "00000000-0000-4000-8000-0000000000f0";
const PATIENT_A = "aaaaaaaa-0000-4000-8000-000000000001";
const PATIENT_B = "bbbbbbbb-0000-4000-8000-000000000002";
const ENC = "eeeeeeee-0000-4000-8000-000000000001";

async function clearLocal() {
  const all = await billingRepository.findAll();
  for (const b of all) await billingRepository.remove(b.id);
}

const baseInput = (overrides: Partial<Parameters<typeof createBillingDual>[0]> = {}) => ({
  orgId: ORG,
  patientId: PATIENT_A,
  type: "充值" as const,
  amount: 1000,
  sessions: 5,
  note: "充 1000 元",
  ...overrides,
});

describe("billing dual-mode dispatcher (no Supabase env → fallback)", () => {
  beforeEach(async () => {
    await clearLocal();
  });

  it("createBillingDual 落回 localStorage 并 round-trip", async () => {
    const b = await createBillingDual(baseInput({ type: "充值", amount: 1000, sessions: 5 }));
    expect(b.id).toBeTruthy();
    expect(b.amount).toBe(1000);
    expect(b.sessions).toBe(5);
    const list = await findBillingByPatientDual(PATIENT_A);
    expect(list.some((x) => x.id === b.id)).toBe(true);
  });

  it("findBillingByEncounterDual 仅返回该 encounter 关联记录", async () => {
    await createBillingDual(baseInput({ encounterId: ENC }));
    await createBillingDual(baseInput({ note: "no enc" })); // 不关联
    const list = await findBillingByEncounterDual(ENC);
    expect(list).toHaveLength(1);
    expect(list[0]?.encounterId).toBe(ENC);
  });

  it("findBillingByPatientDual 按 patient 隔离", async () => {
    await createBillingDual(baseInput({}));
    await createBillingDual(baseInput({ patientId: PATIENT_B, note: "B" }));
    const a = await findBillingByPatientDual(PATIENT_A);
    const b = await findBillingByPatientDual(PATIENT_B);
    expect(a.every((x) => x.patientId === PATIENT_A)).toBe(true);
    expect(b.every((x) => x.patientId === PATIENT_B)).toBe(true);
  });

  it("calcBalance:充值 1000 + 消费 300 = 余额 700 / 剩余次数 -1 还没发生", async () => {
    await createBillingDual(baseInput({ type: "充值", amount: 1000, sessions: 5 }));
    await createBillingDual(baseInput({ type: "消费", amount: 300, sessions: 1 }));
    const records = await findBillingByPatientDual(PATIENT_A);
    const bal = calcBalance(records);
    expect(bal.balance).toBe(700);
    expect(bal.totalRecharge).toBe(1000);
    expect(bal.totalSpent).toBe(300);
    expect(bal.sessionBalance).toBe(4);
  });

  it("calcBalance 退费(负 delta)同样扣减", async () => {
    await createBillingDual(baseInput({ type: "充值", amount: 1000, sessions: 5 }));
    await createBillingDual(baseInput({ type: "退费", amount: 100, note: "退款" }));
    const records = await findBillingByPatientDual(PATIENT_A);
    const bal = calcBalance(records);
    // 充值总额 - (消费 + 退费) = 1000 - 100 = 900
    expect(bal.balance).toBe(900);
  });

  it("deleteBillingDual 软删除", async () => {
    const b = await createBillingDual(baseInput({}));
    await deleteBillingDual(b.id);
    const list = await findBillingByPatientDual(PATIENT_A);
    expect(list.find((x) => x.id === b.id)).toBeUndefined();
  });
});
