/**
 * submitAssessmentSubmission — 顾客匿名提交自评量表结果
 *
 * 契约:
 *   - Supabase 可用:INSERT assessment_submissions,返回 ok + submissionId
 *   - Supabase 不可用:写 localStorage pending queue,返回 ok
 *   - INSERT 失败:返回 ok=false + error
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { submitAssessmentSubmission } from "./submit-submission";

// mock lib/supabase 的 getSupabase
vi.mock("../../lib/supabase", () => ({
  getSupabase: vi.fn(),
}));

import { getSupabase } from "../../lib/supabase";

const MOCK_SHARE = {
  id: "share-1",
  patientId: "p-1",
  encounterId: "e-1",
  orgId: "org-1",
};

const MOCK_DATA = {
  type: "brain_region" as const,
  payload: { responses: { items: { 1: 2 } }, score: { total: 2 }, phoneEar: null },
};

/** 构造 supabase 链式 mock,捕获 insert payload */
function mockSupabaseInsert(result: { data?: unknown; error?: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ maybeSingle });
  const insert = vi.fn().mockReturnValue({ select });
  (getSupabase as ReturnType<typeof vi.fn>).mockReturnValue({
    from: () => ({ insert }),
  });
  return { insert, maybeSingle };
}

describe("submitAssessmentSubmission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Supabase 可用:INSERT 成功 → ok=true + submissionId", async () => {
    const { insert } = mockSupabaseInsert({ data: { id: "sub-123" }, error: null });

    const result = await submitAssessmentSubmission("tok-1", MOCK_SHARE, MOCK_DATA);

    expect(result.ok).toBe(true);
    expect(result.submissionId).toBe("sub-123");
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toMatchObject({
      share_id: "share-1",
      patient_id: "p-1",
      encounter_id: "e-1",
      org_id: "org-1",
      type: "brain_region",
    });
  });

  it("Supabase 不可用:明确报错,不静默排队(顾客设备与治疗师设备分离,结果无法回传)", async () => {
    (getSupabase as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const result = await submitAssessmentSubmission("tok-2", MOCK_SHARE, MOCK_DATA);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Supabase/);
    expect(localStorage.getItem("pending_submissions:tok-2")).toBeNull();
  });

  it("Supabase INSERT 失败 → ok=false + error", async () => {
    mockSupabaseInsert({ data: null, error: { message: "RLS denied" } });

    const result = await submitAssessmentSubmission("tok-3", MOCK_SHARE, MOCK_DATA);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("RLS denied");
  });

  it("Supabase 不可用时 pain_assessment 同样报错", async () => {
    (getSupabase as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const result = await submitAssessmentSubmission("tok-4", MOCK_SHARE, {
      type: "pain_assessment",
      payload: { csi: { items: {}, total: 0 }, slanss: { items: {}, total: 0 } },
    });

    expect(result.ok).toBe(false);
  });
});