import { getSupabase } from "../../lib/supabase";
import type { ScaleId } from "./share.types";

/**
 * 顾客匿名提交自评量表结果。
 *
 * 顶层设计:
 *   - 直接 INSERT 到 assessment_submissions(anon RLS 允许)
 *   - 数据库触发器反查 shares 行校验 token/type/payload,并把权威
 *     租户字段写入 assessments 表,治疗师端立即可见
 *
 * 前提:必须配 Supabase —— 单机模式(无 Supabase)下顾客设备与治疗师
 * 设备分离,结果无法回传,明确返回错误而非静默排队。
 */

/** 量表元数据 — 单点维护(治疗师 UI + 顾客 UI 共用) */
export const SCALE_OPTIONS: ReadonlyArray<{
  id: ScaleId;
  label: string;
  emoji: string;
  count: number;
  desc: string;
}> = [
  {
    id: "brain_region",
    label: "大脑区域定位表",
    emoji: "🧠",
    count: 100,
    desc: "评估 16 个脑功能区症状负担",
  },
  {
    id: "pain_assessment",
    label: "CSI + S-LANSS 联合评估",
    emoji: "📋",
    count: 32,
    desc: "中枢敏化 (25) + 神经病理性疼痛 (7)",
  },
];

export interface AssessmentSubmissionPayload {
  type: "brain_region" | "pain_assessment";
  payload: Record<string, unknown>;
}

export interface SubmissionResult {
  ok: boolean;
  submissionId?: string;
  error?: string;
}

export async function submitAssessmentSubmission(
  token: string,
  share: { id: string; patientId: string; encounterId: string; orgId: string },
  data: AssessmentSubmissionPayload,
): Promise<SubmissionResult> {
  const supabase = getSupabase();
  if (!supabase) {
    // 单机模式:结果留在顾客设备上,治疗师无法看到 —— 明确报错而非静默排队
    return {
      ok: false,
      error: "当前系统未配置云端存储,顾客提交无法回传。请联系管理员配置 Supabase。",
    };
  }

  const { data: row, error } = await supabase
    .from("assessment_submissions")
    .insert({
      share_id: share.id,
      org_id: share.orgId,
      patient_id: share.patientId,
      encounter_id: share.encounterId,
      type: data.type,
      payload: data.payload,
    })
    .select("id")
    .maybeSingle();

  if (error || !row) {
    return { ok: false, error: error?.message ?? "提交失败" };
  }
  return { ok: true, submissionId: String(row.id) };
}

/** 量表中文 label(顾客 UI 用) */
export const SCALE_LABEL: Record<ScaleId, string> = {
  brain_region: "大脑区域定位表",
  pain_assessment: "CSI + S-LANSS 联合评估",
};