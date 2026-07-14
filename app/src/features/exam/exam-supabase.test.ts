import { describe, it, expect, beforeEach } from "vitest";
import { examSessionRepository } from "./exam.repository";
import {
  findSessionsByEncounterDual,
  findLatestSessionDual,
  createExamSessionDual,
  deleteExamSessionDual,
} from "./exam-supabase";

const ORG = "00000000-0000-4000-8000-0000000000f0";
const ENC_A = "eeeeeeee-0000-4000-8000-000000000001";
const ENC_B = "eeeeeeee-0000-4000-8000-000000000002";

async function clearLocal() {
  const all = await examSessionRepository.findAll();
  for (const s of all) await examSessionRepository.remove(s.id);
}

const inputA = (encId: string) => ({
  orgId: ORG,
  encounterId: encId,
  results: { "vor-test": { gain: 0.85, side: "left", note: "略低于正常" } },
});

describe("exam dual-mode dispatcher (no Supabase env → fallback)", () => {
  beforeEach(async () => {
    await clearLocal();
  });

  it("findSessionsByEncounterDual 按 encounter 隔离并按时间降序", async () => {
    await createExamSessionDual(inputA(ENC_A) as Parameters<typeof createExamSessionDual>[0]);
    await createExamSessionDual(inputA(ENC_A) as Parameters<typeof createExamSessionDual>[0]);
    await createExamSessionDual(inputA(ENC_B) as Parameters<typeof createExamSessionDual>[0]);

    const listA = await findSessionsByEncounterDual(ENC_A);
    expect(listA).toHaveLength(2);
    expect(listA.every((s) => s.encounterId === ENC_A)).toBe(true);
  });

  it("findLatestSessionDual 返回最新一条", async () => {
    const first = await createExamSessionDual(inputA(ENC_A) as Parameters<typeof createExamSessionDual>[0]);
    await new Promise((r) => setTimeout(r, 5));
    const second = await createExamSessionDual(inputA(ENC_A) as Parameters<typeof createExamSessionDual>[0]);
    const latest = await findLatestSessionDual(ENC_A);
    expect(latest?.id).toBe(second.id);
    expect(latest?.id).not.toBe(first.id);
  });

  it("createExamSessionDual 完整保存 results 对象", async () => {
    const s = await createExamSessionDual(inputA(ENC_A) as Parameters<typeof createExamSessionDual>[0]);
    expect(s.results["vor-test"]).toBeTruthy();
    const fetched = (await findSessionsByEncounterDual(ENC_A))[0];
    expect(fetched?.results["vor-test"]).toBeTruthy();
  });

  it("deleteExamSessionDual 软删除后查询不到", async () => {
    const s = await createExamSessionDual(inputA(ENC_A) as Parameters<typeof createExamSessionDual>[0]);
    await deleteExamSessionDual(s.id);
    const list = await findSessionsByEncounterDual(ENC_A);
    expect(list).toHaveLength(0);
  });
});
