import { describe, it, expect, beforeEach } from "vitest";
import { followupRepository } from "./followup.repository";
import {
  findFollowupsByPatientDual,
  findAllPendingDual,
  createFollowupDual,
  updateFollowupDual,
  deleteFollowupDual,
} from "./followup-supabase";

const ORG = "00000000-0000-4000-8000-0000000000f0";
const PATIENT_A = "aaaaaaaa-0000-4000-8000-000000000001";
const PATIENT_B = "bbbbbbbb-0000-4000-8000-000000000002";

async function clearLocal() {
  const all = await followupRepository.findAll();
  for (const f of all) await followupRepository.remove(f.id);
}

const baseInput = (overrides: Partial<Parameters<typeof createFollowupDual>[0]> = {}) => ({
  orgId: ORG,
  patientId: PATIENT_A,
  dueDate: new Date("2026-08-01"),
  note: "8月初复诊",
  status: "待复诊" as const,
  ...overrides,
});

describe("followup dual-mode dispatcher (no Supabase env → fallback)", () => {
  beforeEach(async () => {
    await clearLocal();
  });

  it("createFollowupDual 落回 localStorage 并 round-trip", async () => {
    const f = await createFollowupDual(baseInput({}));
    expect(f.id).toBeTruthy();
    expect(f.note).toBe("8月初复诊");
    expect(f.status).toBe("待复诊");
    const list = await findFollowupsByPatientDual(PATIENT_A);
    expect(list.some((x) => x.id === f.id)).toBe(true);
  });

  it("findFollowupsByPatientDual 按 dueDate 升序,patient 隔离", async () => {
    await createFollowupDual(baseInput({ dueDate: new Date("2026-08-15"), note: "B" }));
    await createFollowupDual(baseInput({ dueDate: new Date("2026-08-01"), note: "A" }));
    await createFollowupDual(baseInput({ patientId: PATIENT_B, dueDate: new Date("2026-07-30"), note: "OTHER" }));

    const listA = await findFollowupsByPatientDual(PATIENT_A);
    expect(listA).toHaveLength(2);
    expect(listA[0]?.note).toBe("A"); // 早的在前
    expect(listA[1]?.note).toBe("B");
    expect(listA.every((x) => x.patientId === PATIENT_A)).toBe(true);
  });

  it("findAllPendingDual 仅返回 待复诊", async () => {
    await createFollowupDual(baseInput({ status: "待复诊" }));
    await createFollowupDual(baseInput({ status: "已完成" }));
    const pending = await findAllPendingDual();
    expect(pending.every((p) => p.status === "待复诊")).toBe(true);
  });

  it("updateFollowupDual 切换状态并保留已完成 encounterId", async () => {
    const f = await createFollowupDual(baseInput({}));
    const updated = await updateFollowupDual(f.id, { status: "已完成", completedEncounterId: "enc-1" });
    expect(updated?.status).toBe("已完成");
    expect(updated?.completedEncounterId).toBe("enc-1");
  });

  it("deleteFollowupDual 软删除", async () => {
    const f = await createFollowupDual(baseInput({}));
    await deleteFollowupDual(f.id);
    const list = await findFollowupsByPatientDual(PATIENT_A);
    expect(list.find((x) => x.id === f.id)).toBeUndefined();
  });
});
