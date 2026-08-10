import { getSupabase } from "../../lib/supabase";
import { getShareRefFromUrl, gatewaySubmit } from "./share-gateway";
import type { ScaleId } from "./share.types";

/**
 * 顾客匿名提交自评量表结果。
 *
 * 顶层设计(两条通道):
 *   - 治疗师/已配置设备:直接 INSERT 到 assessment_submissions(anon RLS 允许)
 *   - 客户无配置设备(方案二):走 share-gateway 公共函数,凭 URL 里的 ref +
 *     token 提交,浏览器全程无 key
 *   两通道最终都由数据库触发器反查 shares 校验 token/type/payload,并把权威
 *   租户字段写入 assessments 表,治疗师端立即可见
 *
 * 前提:两条通道都不通(无配置且链接缺 ref)时明确返回错误而非静默排队。
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
    // 客户扫码设备(无配置):链接带 ref → share-gateway 公共函数提交
    const ref = getShareRefFromUrl();
    if (ref) return gatewaySubmit(ref, token, data);
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