// share-gateway — 客户扫码填表的公开网关(无需任何 Supabase key)
//
// 为什么需要它:
//   治疗师端 app 直连 Supabase(anon key 在浏览器),但分发给客户的
//   二维码不该要求客户设备持有任何 key。本函数作为唯一公开入口:
//     · 浏览器只带 token 调用,永远接触不到 anon/service key
//     · 函数内用 service_role(只存在于函数运行环境)访问数据库
//     · token 精确匹配 + 未撤销 + 未过期才放行,无法枚举他人数据
//
// 部署:Supabase 仪表盘 → Edge Functions → 新建 share-gateway →
//       粘贴本文件 → Deploy;确保该函数 "Enforce JWT Verification" 关闭
//       (公开函数,token 即凭证)。CLI 部署:supabase functions deploy share-gateway --no-verify-jwt
//
// 接口:
//   GET  /share-gateway?token=anrm-xxx        → { share } | 404
//   POST /share-gateway  { token, type, payload } → { ok, submissionId } | 4xx

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*", // 公开接口,token 即凭证;无 cookie 不涉及跨站凭证
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

// 兼容旧 8 位短 token 与新 UUID token
const TOKEN_RE = /^anrm-[0-9a-f-]{8,36}$/i;
const SCALE_TYPES = new Set(["brain_region", "pain_assessment"]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

/** 凭 token 查有效 share(未撤销、未过期);查不到返回 null */
async function findValidShare(admin: SupabaseClient, token: string) {
  const { data, error } = await admin
    .from("shares")
    .select(
      "id, encounter_id, patient_id, org_id, token, revoked, expires_at," +
        " homework, next_visit, message, mode, scales, snapshot, created_at",
    )
    .eq("token", token)
    .eq("revoked", false)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // ---- 读取分享(顾客打开链接) ----
  if (req.method === "GET") {
    const token = new URL(req.url).searchParams.get("token") ?? "";
    if (!TOKEN_RE.test(token)) return json({ error: "invalid token" }, 400);
    const share = await findValidShare(admin, token);
    if (!share) return json({ error: "not found" }, 404);
    return json({ share });
  }

  // ---- 提交量表(顾客作答完成) ----
  if (req.method === "POST") {
    let body: { token?: unknown; type?: unknown; payload?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ error: "bad json" }, 400);
    }

    const token = typeof body.token === "string" ? body.token : "";
    const type = typeof body.type === "string" ? body.type : "";
    if (!TOKEN_RE.test(token)) return json({ error: "invalid token" }, 400);
    if (!SCALE_TYPES.has(type)) return json({ error: "invalid type" }, 400);
    if (typeof body.payload !== "object" || body.payload === null) {
      return json({ error: "invalid payload" }, 400);
    }

    // 服务端反查 share —— 租户/患者/就诊字段以数据库为准,不信客户端
    const share = await findValidShare(admin, token);
    if (!share) return json({ error: "share not found or expired" }, 404);
    if (!Array.isArray(share.scales) || !share.scales.includes(type)) {
      return json({ error: "type not allowed for this share" }, 403);
    }

    // 写入 assessment_submissions;0012 的触发器会再次校验
    // (revoked/expired/type/payload 结构)并同步进 assessments 表
    const { data, error } = await admin
      .from("assessment_submissions")
      .insert({
        share_id: share.id,
        org_id: share.org_id,
        patient_id: share.patient_id,
        encounter_id: share.encounter_id,
        type,
        payload: body.payload,
      })
      .select("id")
      .maybeSingle();
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, submissionId: data?.id ?? null });
  }

  return json({ error: "method not allowed" }, 405);
});
