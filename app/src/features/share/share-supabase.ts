/**
 * Supabase 分享仓储 — 分享链接走云端(患者端需跨设备访问)。
 * 当 Supabase 环境变量未配时,自动回退到 localStorage 仓储。
 *
 * 用法:替换 share.repository.ts 中的 lazyPersistent 为 supabaseShareRepo,
 *       其余调用方(createShare/revokeShare/PatientViewPage)无需改动。
 */
import { supabase } from "../../lib/supabase";
import { shareRepository, generateToken, defaultExpiry } from "./share.repository";
import type { ShareRecord } from "./share.repository";

function isSupabaseReady(): boolean {
  try {
    return Boolean(supabase);
  } catch {
    return false;
  }
}

export async function createSupabaseShare(input: {
  encounterId: string;
  patientId: string;
  homework?: string;
  nextVisit?: Date;
  message?: string;
}): Promise<ShareRecord> {
  if (!isSupabaseReady()) {
    // 回退到 localStorage
    return shareRepository.create({
      encounterId: input.encounterId,
      patientId: input.patientId,
      orgId: "00000000-0000-4000-8000-0000000000f0",
      token: generateToken(),
      revoked: false,
      expiresAt: defaultExpiry(),
      homework: input.homework,
      nextVisit: input.nextVisit,
      message: input.message,
    });
  }

  // Supabase 路径
  const token = generateToken();
  const { error } = await supabase.from("shares").insert({
    encounter_id: input.encounterId,
    patient_id: input.patientId,
    org_id: "00000000-0000-4000-8000-0000000000f0",
    token,
    revoked: false,
    expires_at: defaultExpiry().toISOString(),
    homework: input.homework ?? null,
    next_visit: input.nextVisit?.toISOString() ?? null,
    message: input.message ?? null,
  });

  if (error) throw new Error(`Supabase 创建分享失败: ${error.message}`);

  return {
    id: token,
    encounterId: input.encounterId,
    patientId: input.patientId,
    orgId: "00000000-0000-4000-8000-0000000000f0",
    token,
    revoked: false,
    expiresAt: defaultExpiry(),
    homework: input.homework,
    nextVisit: input.nextVisit,
    message: input.message,
    createdAt: new Date(),
  } as ShareRecord;
}

/** 患者端按 token 查询分享(匿名,无需登录) */
export async function findShareByTokenSupabase(token: string): Promise<ShareRecord | null> {
  if (!isSupabaseReady()) {
    const { findShareByToken } = await import("./share.repository");
    return findShareByToken(token);
  }

  const { data, error } = await supabase
    .from("shares")
    .select("*")
    .eq("token", token)
    .eq("revoked", false)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    encounterId: data.encounter_id,
    patientId: data.patient_id,
    orgId: data.org_id,
    token: data.token,
    revoked: data.revoked,
    expiresAt: new Date(data.expires_at),
    homework: data.homework ?? undefined,
    nextVisit: data.next_visit ? new Date(data.next_visit) : undefined,
    message: data.message ?? undefined,
    createdAt: new Date(data.created_at),
  } as ShareRecord;
}

/** 撤销分享 */
export async function revokeShareSupabase(token: string): Promise<void> {
  if (!isSupabaseReady()) {
    const all = await shareRepository.findAll();
    const found = all.find((s) => s.token === token);
    if (found) await shareRepository.update(found.id, { revoked: true });
    return;
  }

  await supabase.from("shares").update({ revoked: true }).eq("token", token);
}
