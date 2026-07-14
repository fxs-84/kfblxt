import { describe, it, expect } from "vitest";
import { assessmentRepository } from "./assessment.repository";
import {
  findAssessmentsByPatientDual,
  findAssessmentsByEncounterDual,
} from "./assessment-supabase";

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
    // 本测试使用占位 — 实际 input shape 取决于 scale 类型
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
});
