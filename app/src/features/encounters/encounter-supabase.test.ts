import { describe, it, expect, beforeEach } from "vitest";
import { encounterRepository } from "./encounter.repository";
import {
  findEncountersByPatientDual,
  findEncounterByIdDual,
  createEncounterDual,
  updateEncounterDual,
  deleteEncounterDual,
} from "./encounter-supabase";

const ORG = "00000000-0000-4000-8000-0000000000f0";
const PATIENT_A = "aaaaaaaa-0000-4000-8000-000000000001";
const PATIENT_B = "bbbbbbbb-0000-4000-8000-000000000002";

async function clearLocal() {
  const all = await encounterRepository.findAll();
  for (const e of all) await encounterRepository.remove(e.id);
}

const cc = (overrides = {}) => ({
  regions: ["left-lower-back"],
  nature: ["麻木"],
  vas: 5,
  durationText: "1个月",
  ...overrides,
});

const inputA = {
  orgId: ORG,
  patientId: PATIENT_A,
  encounterDate: new Date("2026-07-01"),
  visitType: "初诊" as const,
  status: "已结束" as const,
  amount: 300,
  chiefComplaint: cc(),
};

describe("encounter dual-mode dispatcher (no Supabase env → fallback)", () => {
  beforeEach(async () => {
    await clearLocal();
  });

  it("findByPatientDual 落回 localStorage 仓储并按 encounter_date 降序", async () => {
    await encounterRepository.create({
      ...inputA,
      encounterDate: new Date("2026-06-01"),
    } as Parameters<typeof encounterRepository.create>[0]);
    await encounterRepository.create({
      ...inputA,
      encounterDate: new Date("2026-07-01"),
    } as Parameters<typeof encounterRepository.create>[0]);
    await encounterRepository.create({
      ...inputA,
      patientId: PATIENT_B,
      encounterDate: new Date("2026-07-10"),
    } as Parameters<typeof encounterRepository.create>[0]);

    const listA = await findEncountersByPatientDual(PATIENT_A);
    expect(listA).toHaveLength(2);
    expect(listA[0]?.encounterDate.toISOString().slice(0, 10)).toBe("2026-07-01");
    expect(listA[1]?.encounterDate.toISOString().slice(0, 10)).toBe("2026-06-01");
    expect(listA.every((e) => e.patientId === PATIENT_A)).toBe(true);
  });

  it("findByIdDual 找得到与找不到", async () => {
    const created = await createEncounterDual(inputA as Parameters<typeof createEncounterDual>[0]);
    const found = await findEncounterByIdDual(created.id);
    expect(found?.id).toBe(created.id);
    expect(await findEncounterByIdDual("non-existent-uuid-x")).toBeNull();
  });

  it("createEncounterDual 落回 localStorage 并 round-trip", async () => {
    const e = await createEncounterDual(inputA as Parameters<typeof createEncounterDual>[0]);
    expect(e.id).toBeTruthy();
    expect(e.patientId).toBe(PATIENT_A);
    const fetched = await findEncounterByIdDual(e.id);
    expect(fetched?.id).toBe(e.id);
  });

  it("updateEncounterDual 可更新 visitType 与 status", async () => {
    const e = await createEncounterDual(inputA as Parameters<typeof createEncounterDual>[0]);
    const updated = await updateEncounterDual(e.id, { visitType: "复诊", status: "进行中" });
    expect(updated.visitType).toBe("复诊");
    expect(updated.status).toBe("进行中");
  });

  it("deleteEncounterDual 软删除后查询不到", async () => {
    const e = await createEncounterDual(inputA as Parameters<typeof createEncounterDual>[0]);
    await deleteEncounterDual(e.id);
    expect(await findEncounterByIdDual(e.id)).toBeNull();
  });
});
