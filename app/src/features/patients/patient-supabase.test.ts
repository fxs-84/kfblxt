import { describe, it, expect, beforeEach } from "vitest";
import { patientRepository } from "./patient.repository";
import {
  findAllPatientsDual,
  createPatientDual,
  updatePatientDual,
  deletePatientDual,
} from "./patient-supabase";

const ORG = "00000000-0000-4000-8000-0000000000f0";

async function clearLocal() {
  const all = await patientRepository.findAll();
  for (const p of all) await patientRepository.remove(p.id);
}

describe("patient dual-mode dispatcher (no Supabase env → fallback)", () => {
  beforeEach(async () => {
    await clearLocal();
  });

  it("findAllPatientsDual 在 Supabase 未配时落回 localStorage(同机构过滤)", async () => {
    await patientRepository.create({
      orgId: ORG,
      medicalRecordNo: "ANRM-DUAL-1",
      name: "测试客户",
      sex: "male",
      birthDate: new Date("1990-01-01"),
      phone: "13900000000",
      dominantHand: "right",
    } as Parameters<typeof patientRepository.create>[0]);
    await patientRepository.create({
      orgId: "11111111-0000-4000-8000-0000000000f0",
      medicalRecordNo: "ANRM-OTHER",
      name: "其他机构",
      sex: "female",
      birthDate: new Date("1992-02-02"),
    } as Parameters<typeof patientRepository.create>[0]);

    const list = await findAllPatientsDual(ORG);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.every((p) => p.orgId === ORG)).toBe(true);
    expect(list.some((p) => p.medicalRecordNo === "ANRM-DUAL-1")).toBe(true);
    expect(list.every((p) => p.medicalRecordNo !== "ANRM-OTHER")).toBe(true);
  });

  it("createPatientDual → 现有 localStorage 仓储写入并 round-trip", async () => {
    const created = await createPatientDual({
      orgId: ORG,
      medicalRecordNo: "ANRM-DUAL-NEW",
      name: "新建客户",
      sex: "male",
      birthDate: new Date("1985-05-15"),
    } as Parameters<typeof createPatientDual>[0]);
    expect(created.id).toBeTruthy();
    expect(created.medicalRecordNo).toBe("ANRM-DUAL-NEW");

    const list = await findAllPatientsDual(ORG);
    const found = list.find((p) => p.id === created.id);
    expect(found).toBeTruthy();
    expect(found?.name).toBe("新建客户");
  });

  it("updatePatientDual → 现有 localStorage 仓储 update", async () => {
    const created = await createPatientDual({
      orgId: ORG,
      medicalRecordNo: "ANRM-DUAL-UPD",
      name: "原名",
      sex: "female",
      birthDate: new Date("1990-01-01"),
    } as Parameters<typeof createPatientDual>[0]);
    const updated = await updatePatientDual(created.id, { name: "改后名" });
    expect(updated.name).toBe("改后名");
  });

  it("deletePatientDual → soft-delete (findAll 不再返回)", async () => {
    const created = await createPatientDual({
      orgId: ORG,
      medicalRecordNo: "ANRM-DUAL-DEL",
      name: "将删除",
      sex: "male",
      birthDate: new Date("1990-01-01"),
    } as Parameters<typeof createPatientDual>[0]);
    await deletePatientDual(created.id);
    const list = await findAllPatientsDual(ORG);
    expect(list.find((p) => p.id === created.id)).toBeUndefined();
  });
});
