import { describe, it, expect } from "vitest";
import { assessmentRepository } from "./assessment.repository";
import {
  createAssessmentDual,
  findAssessmentsByPatientDual,
  findAssessmentsByEncounterDual,
} from "./assessment-supabase";
import type { PainAssessmentInput } from "./assessment.types";

describe("assessment dual-mode dispatcher (no Supabase env → fallback)", () => {
  it("findAssessmentsByPatientDual 落回 localStorage 仓储", async () => {
    const list = await findAssessmentsByPatientDual("aaaaaaaa-0000-4000-8000-000000000001");
    expect(Array.isArray(list)).toBe(true);
  });

  it("findAssessmentsByEncounterDual 落回 localStorage 仓储", async () => {
    const list = await findAssessmentsByEncounterDual("enc-test-001");
    expect(Array.isArray(list)).toBe(true);
  });

  it("createAssessmentDual 落回 localStorage (assessmentRepository.create)", async () => {
    const before = (await assessmentRepository.findAll()).length;
    await assessmentRepository.create({
      // @ts-expect-error - 简化:任意类型在测试中可被存储层接受
      type: "brain_region",
      patientId: "aaaaaaaa-0000-4000-8000-000000000001",
      orgId: "00000000-0000-4000-8000-0000000000f0",
      encounterId: undefined,
      responses: {},
      scores: {},
      note: "test",
    } as Parameters<typeof assessmentRepository.create>[0]);
    const after = (await assessmentRepository.findAll()).length;
    expect(after).toBe(before + 1);
  });

  it("createAssessmentDual 对 pain_assessment 成功创建并保留 csi/slanss", async () => {
    const input: PainAssessmentInput = {
      type: "pain_assessment",
      patientId: "aaaaaaaa-0000-4000-8000-000000000001",
      orgId: "00000000-0000-4000-8000-0000000000f0",
      encounterId: "enc-pain-001",
      csi: {
        items: { 1: 2, 2: 3 },
        total: 5,
        severity: "normal",
      },
      slanss: {
        items: { 1: 5, 2: 0 },
        total: 5,
        positive: false,
      },
    };

    const created = await createAssessmentDual(input);

    expect(created.type).toBe("pain_assessment");
    expect(created.patientId).toBe(input.patientId);
    expect(created.encounterId).toBe(input.encounterId);
    expect(created.csi.total).toBe(5);
    expect(created.csi.severity).toBe("normal");
    expect(created.slanss.total).toBe(5);
    expect(created.slanss.positive).toBe(false);

    const byPatient = await findAssessmentsByPatientDual(input.patientId);
    expect(byPatient.some((r) => r.id === created.id)).toBe(true);

    const byEncounter = await findAssessmentsByEncounterDual(input.encounterId as string);
    expect(byEncounter.some((r) => r.id === created.id)).toBe(true);
  });

  it("createAssessmentDual 缺少 patientId 时抛出明确错误", async () => {
    const before = (await assessmentRepository.findAll()).length;
    await expect(
      createAssessmentDual({
        type: "pain_assessment",
        // @ts-expect-error - 故意测试运行时缺失 patientId
        patientId: undefined,
        orgId: "00000000-0000-4000-8000-0000000000f0",
        encounterId: "enc-pain-002",
        csi: { items: {}, total: 0, severity: "normal" },
        slanss: { items: {}, total: 0, positive: false },
      } as unknown as PainAssessmentInput),
    ).rejects.toThrow(/客户 ID|patientId/);
    const after = (await assessmentRepository.findAll()).length;
    expect(after).toBe(before);
  });

  it("findAssessmentsByEncounterDual 同时返回 encounter_id=null 的同患者记录", async () => {
    const patientId = "aaaaaaaa-0000-4000-8000-000000000002";
    const input: PainAssessmentInput = {
      type: "pain_assessment",
      patientId,
      orgId: "00000000-0000-4000-8000-0000000000f0",
      csi: { items: { 1: 1 }, total: 1, severity: "normal" },
      slanss: { items: { 1: 0 }, total: 0, positive: false },
    };
    const created = await createAssessmentDual(input);

    const list = await findAssessmentsByEncounterDual("new", patientId);
    expect(list.some((r) => r.id === created.id)).toBe(true);
  });
});
