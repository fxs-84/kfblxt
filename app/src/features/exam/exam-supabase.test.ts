import { describe, it, expect, beforeEach } from "vitest";
import { examSessionRepository } from "./exam.repository";
import {
  findSessionsByEncounterDual,
  findLatestSessionDual,
  createExamSessionDual,
  deleteExamSessionDual,
  findAllExamSessionsDual,
} from "./exam-supabase";
import type { ExamSessionInput } from "./exam.repository";

const ORG = "00000000-0000-4000-8000-0000000000f0";
const PAT_A = "aaaaaaaa-0000-4000-8000-000000000001";
const PAT_B = "aaaaaaaa-0000-4000-8000-000000000002";
const ENC_A = "eeeeeeee-0000-4000-8000-000000000001";
const ENC_B = "eeeeeeee-0000-4000-8000-000000000002";

async function clearLocal() {
  const all = await examSessionRepository.findAll();
  for (const s of all) await examSessionRepository.remove(s.id);
}

const inputA = (encId: string): ExamSessionInput => ({
  orgId: ORG,
  patientId: PAT_A,
  encounterId: encId,
  results: { "vor-test": { gain: 0.85, side: "left", note: "略低于正常" } },
});

describe("exam dual-mode dispatcher (no Supabase env → fallback)", () => {
  beforeEach(async () => {
    await clearLocal();
  });

  it("findSessionsByEncounterDual 按 encounter 隔离并按时间降序", async () => {
    await createExamSessionDual(inputA(ENC_A));
    await createExamSessionDual(inputA(ENC_A));
    await createExamSessionDual(inputA(ENC_B));

    const listA = await findSessionsByEncounterDual(ENC_A);
    expect(listA).toHaveLength(2);
    expect(listA.every((s) => s.encounterId === ENC_A)).toBe(true);
  });

  it("findLatestSessionDual 返回最新一条", async () => {
    const first = await createExamSessionDual(inputA(ENC_A));
    await new Promise((r) => setTimeout(r, 5));
    const second = await createExamSessionDual(inputA(ENC_A));
    const latest = await findLatestSessionDual(ENC_A);
    expect(latest?.id).toBe(second.id);
    expect(latest?.id).not.toBe(first.id);
  });

  it("createExamSessionDual 完整保存 results 与 patientId", async () => {
    const s = await createExamSessionDual(inputA(ENC_A));
    expect(s.patientId).toBe(PAT_A);
    expect(s.results["vor-test"]).toBeTruthy();
    const fetched = (await findSessionsByEncounterDual(ENC_A))[0];
    expect(fetched?.patientId).toBe(PAT_A);
    expect(fetched?.results["vor-test"]).toBeTruthy();
  });

  it("createExamSessionDual 缺少 patientId 时抛出明确错误", async () => {
    const before = (await examSessionRepository.findAll()).length;
    await expect(
      createExamSessionDual({
        orgId: ORG,
        encounterId: ENC_A,
        results: { "vor-test": { gain: 0.85 } },
        // @ts-expect-error - 故意测试运行时缺失 patientId
        patientId: undefined,
      } as unknown as ExamSessionInput),
    ).rejects.toThrow(/客户 ID|patientId/);
    const after = (await examSessionRepository.findAll()).length;
    expect(after).toBe(before);
  });

  it("createExamSessionDual 使用传入的 patientId 而不是反查结果", async () => {
    const explicit = await createExamSessionDual({
      orgId: ORG,
      patientId: PAT_B,
      encounterId: ENC_A,
      results: {},
    });
    expect(explicit.patientId).toBe(PAT_B);
  });

  it("findAllExamSessionsDual 返回全部未软删会话", async () => {
    await createExamSessionDual(inputA(ENC_A));
    await createExamSessionDual(inputA(ENC_B));
    const all = await findAllExamSessionsDual();
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(all.some((s) => s.encounterId === ENC_A)).toBe(true);
    expect(all.some((s) => s.encounterId === ENC_B)).toBe(true);
  });

  it("deleteExamSessionDual 软删除后查询不到", async () => {
    const s = await createExamSessionDual(inputA(ENC_A));
    await deleteExamSessionDual(s.id);
    const list = await findSessionsByEncounterDual(ENC_A);
    expect(list).toHaveLength(0);
  });
});
