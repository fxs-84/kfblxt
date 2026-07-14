import { describe, it, expect, beforeEach } from "vitest";
import { attachmentRepository } from "./attachment.repository";
import {
  findAttachmentsByEncounterDual,
  findComparisonPairsDual,
  createAttachmentDual,
  deleteAttachmentDual,
} from "./attachment-supabase";

const ORG = "00000000-0000-4000-8000-0000000000f0";
const ENC = "eeeeeeee-0000-4000-8000-000000000001";

async function clearLocal() {
  const all = await attachmentRepository.findAll();
  for (const a of all) await attachmentRepository.remove(a.id);
}

const baseInput = (overrides: Partial<Parameters<typeof createAttachmentDual>[0]> = {}) => ({
  orgId: ORG,
  encounterId: ENC,
  category: "疗效对比" as const,
  fileName: "test.png",
  mimeType: "image/png",
  dataUrl: "data:image/png;base64,iVBORw0KGgo...",
  sizeBytes: 1024,
  timeline: "治疗前" as const,
  comparisonGroup: "left-knee-A",
  ...overrides,
});

describe("attachment dual-mode dispatcher (no Supabase env → fallback)", () => {
  beforeEach(async () => {
    await clearLocal();
  });

  it("createAttachmentDual 完整保存 + round-trip", async () => {
    const a = await createAttachmentDual(baseInput({}));
    expect(a.id).toBeTruthy();
    expect(a.dataUrl.startsWith("data:image/png;")).toBe(true);
    expect(a.timeline).toBe("治疗前");
    const list = await findAttachmentsByEncounterDual(ENC);
    expect(list.some((x) => x.id === a.id)).toBe(true);
  });

  it("findAttachmentsByEncounterDual 按时间降序", async () => {
    const a = await createAttachmentDual(baseInput({ fileName: "a.png" }));
    await new Promise((r) => setTimeout(r, 5));
    const b = await createAttachmentDual(baseInput({ fileName: "b.png" }));
    const list = await findAttachmentsByEncounterDual(ENC);
    const idxA = list.findIndex((x) => x.id === a.id);
    const idxB = list.findIndex((x) => x.id === b.id);
    expect(idxB).toBeLessThan(idxA);
  });

  it("findComparisonPairsDual 仅返回 category='疗效对比' 的附件", async () => {
    await createAttachmentDual(baseInput({ category: "检查报告", fileName: "report.pdf" }));
    await createAttachmentDual(baseInput({ category: "疗效对比", fileName: "compare.png" }));
    const pairs = await findComparisonPairsDual(ENC);
    expect(pairs.length).toBeGreaterThanOrEqual(1);
    expect(pairs.every((p) => p.category === "疗效对比")).toBe(true);
  });

  it("deleteAttachmentDual 软删除", async () => {
    const a = await createAttachmentDual(baseInput({}));
    await deleteAttachmentDual(a.id);
    const list = await findAttachmentsByEncounterDual(ENC);
    expect(list.find((x) => x.id === a.id)).toBeUndefined();
  });
});
