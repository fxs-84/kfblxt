/**
 * share-gateway 公共函数的浏览器侧客户端 + 分享链接构造。
 *
 * 设计(方案二:key 不上公网):
 *   - 治疗师设备:有 Supabase 配置(localStorage/env),直连数据库;
 *     生成二维码时把项目 ref 编进链接(?share=<token>&ref=<ref>)
 *   - 客户设备:无任何配置,凭链接里的 ref 调用
 *     https://<ref>.supabase.co/functions/v1/share-gateway
 *     读取分享 / 提交量表 —— 全程接触不到 anon/service key
 *   - ref 只是项目编号,不是密钥;函数内 token 校验是唯一凭证
 */
import { getSupabaseProjectRef } from "../../lib/supabase";
import type { AssessmentSubmissionPayload, SubmissionResult } from "./submit-submission";

/** 从当前 URL 读取 ref 参数(客户设备用) */
export function getShareRefFromUrl(): string | null {
  try {
    const ref = new URLSearchParams(window.location.search).get("ref");
    // 只允许合法的项目 ref 形态,防止拼接出任意域名
    if (ref && /^[a-z0-9-]{3,63}$/i.test(ref)) return ref;
    return null;
  } catch {
    return null;
  }
}

/** 网关函数完整地址 */
function gatewayUrl(ref: string, query?: string): string {
  const base = `https://${ref}.supabase.co/functions/v1/share-gateway`;
  return query ? `${base}?${query}` : base;
}

/** 生成扫码分享链接:有 Supabase 配置时附带 ref,客户设备凭它走网关 */
export function buildShareUrl(token: string, hash?: string): string {
  const base = `${window.location.origin}${import.meta.env.BASE_URL}?share=${token}`;
  const ref = getSupabaseProjectRef();
  const url = ref ? `${base}&ref=${encodeURIComponent(ref)}` : base;
  return hash ? `${url}#${hash}` : url;
}

/** 凭 token 读分享(原样返回 DB 行;调用方负责映射)。查不到/出错返回 null */
export async function gatewayLookupRaw(
  ref: string,
  token: string,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(gatewayUrl(ref, `token=${encodeURIComponent(token)}`));
    if (!res.ok) return null;
    const body = (await res.json()) as { share?: Record<string, unknown> };
    return body.share ?? null;
  } catch {
    return null;
  }
}

/** 提交量表结果;服务端以 token 反查 share 后写入,租户字段不信客户端 */
export async function gatewaySubmit(
  ref: string,
  token: string,
  data: AssessmentSubmissionPayload,
): Promise<SubmissionResult> {
  try {
    const res = await fetch(gatewayUrl(ref), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, type: data.type, payload: data.payload }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      submissionId?: string;
      error?: string;
    };
    if (!res.ok || !body.ok) {
      return { ok: false, error: body.error ?? `提交失败(HTTP ${res.status})` };
    }
    return { ok: true, submissionId: body.submissionId };
  } catch (e) {
    return { ok: false, error: `网络错误: ${e instanceof Error ? e.message : String(e)}` };
  }
}
